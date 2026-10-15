-- Work for the owner's agent. The site queues a task with everything the agent needs in params; the agent claims it,
-- does it on the owner's machine, and completes it. Each type of task has its own params and result.
create type task_type as enum ('collect', 'refine');
create type task_status as enum ('queued', 'running', 'done', 'failed');

create table tasks (
  id bigint generated always as identity primary key,
  channel_id bigint not null references channels on delete cascade,
  type task_type not null,
  params jsonb not null,
  status task_status not null default 'queued',
  -- The OAuth client (the agent) that claimed it
  agent text,
  claimed_at timestamptz,
  -- A running task not completed by then goes back to the queue
  lease_until timestamptz,
  attempts smallint not null default 0,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- One open task per channel and type
create unique index tasks_one_open on tasks (channel_id, type) where status in ('queued', 'running');
create index tasks_queue on tasks (created_at) where status = 'queued';

alter table tasks enable row level security;
create policy "owner reads" on tasks for select to authenticated using (owns_channel(channel_id));
revoke all on tasks from anon;
revoke insert, update, delete on tasks from authenticated;

-- What each keyword brought in per collect run; refine judges keywords by it. Only counts, never the posts.
create table keyword_runs (
  id bigint generated always as identity primary key,
  keyword_id bigint not null references search_keywords on delete cascade,
  ran_at timestamptz not null default now(),
  -- New posts the search found, how many the filter kept, and how many were over a day old when found
  collected int not null,
  kept int not null,
  stale int not null
);

alter table keyword_runs enable row level security;
create policy "owner reads" on keyword_runs for select to authenticated
  using (owns_channel((select channel_id from search_keywords where id = keyword_id)));
revoke all on keyword_runs from anon;
revoke insert, update, delete on keyword_runs from authenticated;

-- The agent writes posts as the owner: adds them, and merges duplicates by adding links to sources and deleting the rest
create policy "owner adds" on posts for insert to authenticated with check (owns_channel(channel_id));
create policy "owner edits" on posts for update to authenticated
  using (owns_channel(channel_id)) with check (owns_channel(channel_id));
revoke insert, update on posts from authenticated;
grant insert (channel_id, title, body, sources, embed_provider, embed_id, created_at, collected_at, filter_decision, filter_reason)
  on posts to authenticated;
grant update (sources) on posts to authenticated;

-- Queues a task for the owner's channel, or returns the one already open. Collect params carry the whole crawl:
-- each keyword with where the last run stopped and how many posts to take at the channel's crawl intensity.
-- Refine params fix the labeled posts it learns from, so labels added while it runs wait for the next one.
create function enqueue_task(p_channel_id bigint, p_type task_type)
returns tasks language plpgsql security definer set search_path = public as $$
declare
  p jsonb;
  t tasks;
begin
  if not owns_channel(p_channel_id) then raise exception 'only the channel owner can queue tasks'; end if;
  select * into t from tasks where channel_id = p_channel_id and type = p_type and status in ('queued', 'running');
  if found then return t; end if;

  if p_type = 'collect' then
    select jsonb_build_object(
      'search', jsonb_build_object(
        'url', 'https://x.com/search?q={q}&src=typed_query&f=live',
        'q', '{query} lang:en -filter:replies'),
      'keywords', coalesce(jsonb_agg(jsonb_build_object(
        'id', k.id,
        'query', k.query,
        'since', k.last_posted_at,
        'max_posts', (array[5, 10, 15, 20, 30])[s.crawl_intensity]) order by k.id), '[]'),
      'stop', jsonb_build_object('max_consecutive_old_posts', 1),
      'skip', jsonb_build_array('ads', 'non_english', 'unavailable_links'))
    into p
    from strategy s left join search_keywords k on k.channel_id = s.channel_id
    where s.channel_id = p_channel_id
    group by s.crawl_intensity;
    if p is null then raise exception 'channel has no strategy'; end if;
  else
    select jsonb_build_object('post_ids', coalesce(jsonb_agg(id order by id), '[]')) into p
    from posts
    where channel_id = p_channel_id and not learned
      and (score <> 0 or exists (select 1 from feedback f where f.post_id = posts.id));
    if p->'post_ids' = '[]' then raise exception 'no new labels to learn from'; end if;
  end if;

  insert into tasks (channel_id, type, params) values (p_channel_id, p_type, p) returning * into t;
  return t;
end $$;

-- Hands the oldest queued task of the caller's channels to the calling agent, or null when there is none.
-- A task whose lease ran out goes back to the queue, and fails after its third try.
create function claim_task()
returns tasks language plpgsql security definer set search_path = public as $$
declare
  t tasks;
begin
  update tasks set status = 'failed', error = 'not completed after 3 tries', finished_at = now()
  where status = 'running' and lease_until < now() and attempts >= 3 and owns_channel(channel_id);

  select * into t from tasks
  where owns_channel(channel_id) and (status = 'queued' or (status = 'running' and lease_until < now()))
  order by created_at
  limit 1
  for update skip locked;
  if not found then return null; end if;

  update tasks set
    status = 'running',
    agent = auth.jwt()->>'client_id',
    claimed_at = now(),
    lease_until = now() + interval '30 minutes',
    attempts = attempts + 1
  where id = t.id
  returning * into t;
  return t;
end $$;

-- Finishes a running task with its result.
-- collect: {"keywords": [{"id", "last_posted_at", "collected", "kept", "stale"}]} moves each keyword's stop point
--   and records its run.
-- refine: marks the task's posts learned.
create function complete_task(p_task_id bigint, p_result jsonb)
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
  else
    update posts set learned = true
    where channel_id = t.channel_id and id in (select jsonb_array_elements_text(t.params->'post_ids')::bigint);
  end if;

  update tasks set status = 'done', result = p_result, finished_at = now() where id = t.id returning * into t;
  return t;
end $$;

create function fail_task(p_task_id bigint, p_error text)
returns tasks language plpgsql security definer set search_path = public as $$
declare
  t tasks;
begin
  update tasks set status = 'failed', error = p_error, finished_at = now()
  where id = p_task_id and status = 'running' and owns_channel(channel_id)
  returning * into t;
  if not found then raise exception 'no running task %', p_task_id; end if;
  return t;
end $$;

revoke execute on function enqueue_task, claim_task, complete_task, fail_task from public, anon;
grant execute on function enqueue_task, claim_task, complete_task, fail_task to authenticated;
