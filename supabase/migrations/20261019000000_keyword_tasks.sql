-- Keywords are revised on every run, in a task of their own that comes before the collect; refine now rewrites only
-- the rubric. A keyword whose newest post is over 2 days older than its latest search is deleted when that search
-- completes. A search stops after 3 posts in a row older than where the last one stopped, since X's latest results
-- aren't strictly in time order. The channel keeps its own count of posts collected and kept, which deleting a
-- keyword no longer takes with it.

alter type task_type add value 'keywords';

alter table channels add column posts_collected int not null default 0;
alter table channels add column posts_kept int not null default 0;
update channels c set posts_collected = s.collected, posts_kept = s.kept
from (
  select k.channel_id, sum(r.collected) collected, sum(r.kept) kept
  from keyword_runs r join search_keywords k on k.id = r.keyword_id
  group by k.channel_id
) s
where s.channel_id = c.id;

create or replace function filtered_count(p_channel_id bigint) returns bigint
language sql stable security invoker set search_path = public as $$
  select posts_collected - posts_kept from channels where id = p_channel_id and owns_channel(id);
$$;

create or replace function collect_params(p_channel_id bigint) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'search', jsonb_build_object(
      'url', 'https://x.com/search?q={q}&src=typed_query&f=live',
      'q', '{query} lang:en -filter:replies'),
    'keywords', coalesce(jsonb_agg(jsonb_build_object(
      'id', k.id,
      'query', k.query,
      'since', k.last_posted_at,
      'max_posts', s.posts_per_keyword) order by k.id) filter (where k.id is not null), '[]'),
    'stop', jsonb_build_object('max_consecutive_old_posts', 3),
    'skip', jsonb_build_array('ads', 'non_english', 'unavailable_links'))
  from strategy s left join search_keywords k on k.channel_id = s.channel_id
  where s.channel_id = p_channel_id
  group by s.posts_per_keyword;
$$;

-- A collect, and the keyword revision before it, for the agent's next claim outside the hourly slots
create or replace function run_now(p_channel_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not owns_channel(p_channel_id) then raise exception 'only the channel owner can run a collect'; end if;
  insert into tasks (channel_id, type, params, scheduled_for)
  values (p_channel_id, 'keywords', '{}', now()), (p_channel_id, 'collect', '{}', now())
  on conflict do nothing;
end $$;

-- Hands the next task of the caller's channels to the calling agent, or null when there is none.
-- First it skips the collects and keyword revisions of past slots still not done, and makes this slot's pair for each
-- set-up channel not paused that has none yet this hour. Then it takes a refine first, then a keyword revision, then a
-- collect, filling in its params. A task whose lease ran out goes back to the queue, and fails after its third try.
create or replace function claim_task()
returns tasks language plpgsql security definer set search_path = public as $$
declare
  slot timestamptz := date_trunc('hour', now());
  t tasks;
  p jsonb;
begin
  update channels set agent_claimed_at = now() where owner_id = auth.uid();

  update tasks set status = 'skipped', finished_at = now()
  where type in ('collect', 'keywords') and scheduled_for < slot and owns_channel(channel_id)
    and (status = 'queued' or (status = 'running' and lease_until < now()));

  insert into tasks (channel_id, type, params, scheduled_for)
  select s.channel_id, k.type, '{}', slot
  from strategy s join channels c on c.id = s.channel_id
  cross join (values ('keywords'::task_type), ('collect'::task_type)) k(type)
  where c.owner_id = auth.uid() and not s.paused and s.filter_prompt <> ''
    and not exists (
      select 1 from tasks o where o.channel_id = s.channel_id and o.type = k.type and o.scheduled_for >= slot)
  order by s.channel_id
  on conflict do nothing;

  update tasks set status = 'failed', error = 'not completed after 3 tries', finished_at = now()
  where type <> 'init' and status = 'running' and lease_until < now() and attempts >= 3 and owns_channel(channel_id);

  loop
    select * into t from tasks
    where owns_channel(channel_id) and (type = 'refine' or (type in ('keywords', 'collect') and scheduled_for >= slot))
      and (status = 'queued' or (status = 'running' and lease_until < now()))
    order by case type when 'refine' then 0 when 'keywords' then 1 else 2 end, scheduled_for, id
    limit 1
    for update skip locked;
    if not found then return null; end if;

    p := case t.type
      when 'collect' then collect_params(t.channel_id)
      when 'refine' then refine_params(t.channel_id)
      else '{}' end;
    exit when p is not null and (t.type <> 'collect' or jsonb_array_length(p->'keywords') > 0);
    -- A refine with no new labels to learn from, or a collect with no keywords, has nothing to do
    update tasks set status = 'done', result = '{}', finished_at = now() where id = t.id;
  end loop;

  update tasks set
    status = 'running',
    params = p,
    agent = auth.jwt()->>'client_id',
    claimed_at = now(),
    lease_until = now() + interval '30 minutes',
    attempts = attempts + 1
  where id = t.id
  returning * into t;
  return t;
end $$;

-- Finishes a running task with its result.
-- collect: {"keywords": [{"id", "last_posted_at", "collected", "kept", "stale"}]} moves each keyword's stop point,
--   records its run and adds it to the channel's counts, then deletes the keywords gone stale.
-- keywords: {"keywords": [query, ...] (strings), "changes"} replaces the channel's keywords.
-- refine: {"prompt", "changes"} replaces the channel's filter prompt, counts the iteration, and marks the task's posts
--   learned.
create or replace function complete_task(p_task_id bigint, p_result jsonb)
returns tasks language plpgsql security definer set search_path = public as $$
declare
  t tasks;
begin
  select * into t from tasks where id = p_task_id and status = 'running' and owns_channel(channel_id) for update;
  if not found then raise exception 'no running task %', p_task_id; end if;

  if t.type = 'collect' then
    update search_keywords k set last_posted_at = coalesce((r->>'last_posted_at')::timestamptz, k.last_posted_at)
    from jsonb_array_elements(p_result->'keywords') r
    where k.id = (r->>'id')::bigint and k.channel_id = t.channel_id;

    insert into keyword_runs (keyword_id, collected, kept, stale)
    select k.id, (r->>'collected')::int, (r->>'kept')::int, (r->>'stale')::int
    from jsonb_array_elements(p_result->'keywords') r
    join search_keywords k on k.id = (r->>'id')::bigint and k.channel_id = t.channel_id;

    update channels set
      posts_collected = posts_collected + coalesce((select sum((r->>'collected')::int) from jsonb_array_elements(p_result->'keywords') r), 0),
      posts_kept = posts_kept + coalesce((select sum((r->>'kept')::int) from jsonb_array_elements(p_result->'keywords') r), 0)
    where id = t.channel_id;

    -- Searched just now, and nothing newer than 2 days before: a keyword that never found anything counts from when
    -- it was added
    delete from search_keywords
    where channel_id = t.channel_id
      and id in (select (r->>'id')::bigint from jsonb_array_elements(p_result->'keywords') r)
      and coalesce(last_posted_at, created_at) < now() - interval '2 days';
  elsif t.type = 'keywords' then
    if jsonb_array_length(coalesce(p_result->'keywords', '[]')) = 0 then
      raise exception 'keywords result needs at least one keyword';
    end if;
    if exists (select 1 from jsonb_array_elements(p_result->'keywords') e where jsonb_typeof(e) <> 'string') then
      raise exception 'keywords result must be the search queries as strings';
    end if;
    delete from search_keywords
    where channel_id = t.channel_id and query not in (select jsonb_array_elements_text(p_result->'keywords'));
    insert into search_keywords (channel_id, query)
    select distinct t.channel_id, q from jsonb_array_elements_text(p_result->'keywords') q
    where not exists (select 1 from search_keywords where channel_id = t.channel_id and query = q);
  else
    if coalesce(trim(p_result->>'prompt'), '') = '' then
      raise exception 'refine result needs a prompt';
    end if;
    update strategy set filter_prompt = p_result->>'prompt', iterations = iterations + 1 where channel_id = t.channel_id;

    update posts set learned = true
    where channel_id = t.channel_id and id in (select jsonb_array_elements_text(t.params->'post_ids')::bigint);
  end if;

  update tasks set status = 'done', result = p_result, finished_at = now() where id = t.id returning * into t;
  return t;
end $$;

-- What each of the channel's keywords brought in, summed here so no run is left out: when it was added and its newest
-- post, posts collected in all and in the last day, how many were over a day old, kept, and the owner's votes
create function keyword_stats(p_channel_id bigint)
returns table (
  query text, added_at timestamptz, newest_post_at timestamptz,
  collected bigint, collected_last_day bigint, stale bigint, kept bigint, up bigint, down bigint)
language sql stable security invoker set search_path = public as $$
  select k.query, k.created_at, k.last_posted_at,
    coalesce(sum(r.collected), 0),
    coalesce(sum(r.collected) filter (where r.ran_at > now() - interval '1 day'), 0),
    coalesce(sum(r.stale), 0),
    coalesce(sum(r.kept), 0),
    (select count(*) from posts p where p.keyword_id = k.id and p.score > 0),
    (select count(*) from posts p where p.keyword_id = k.id and p.score < 0)
  from search_keywords k left join keyword_runs r on r.keyword_id = k.id
  where k.channel_id = p_channel_id
  group by k.id
  order by k.id;
$$;

revoke execute on function keyword_stats from public, anon;
grant execute on function keyword_stats to authenticated;
