-- The owner's agent runs every hour on the hour. Each hour is a slot with one collect per channel, made by the first
-- claim in it; a slot's collect not done by the next hour is skipped. The owner also asks for a refine, which the next
-- claim takes first, and starts a collect now. A task's params are filled in when it is claimed, from the channel's
-- settings as they are then: how many posts each keyword takes, and whether the channel is paused.

alter type task_status add value 'skipped';

-- The hour slot a collect belongs to, or when the owner asked for it; null for refine and init
alter table tasks add column scheduled_for timestamptz;

alter table strategy add column posts_per_keyword smallint not null default 10 check (posts_per_keyword between 5 and 50);
update strategy set posts_per_keyword = (array[5, 10, 15, 20, 30])[crawl_intensity];
alter table strategy drop column crawl_intensity;
-- A paused channel gets no hourly collect
alter table strategy add column paused boolean not null default false;
grant update (posts_per_keyword, paused) on strategy to authenticated;

-- When the owner's agent last claimed; the site shows it offline after an hour without
alter table channels add column agent_claimed_at timestamptz;

drop function enqueue_task(bigint, task_type);

-- A collect carries the whole crawl: each keyword with where the last run stopped and how many posts to take
create function collect_params(p_channel_id bigint) returns jsonb
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
    'stop', jsonb_build_object('max_consecutive_old_posts', 1),
    'skip', jsonb_build_array('ads', 'non_english', 'unavailable_links'))
  from strategy s left join search_keywords k on k.channel_id = s.channel_id
  where s.channel_id = p_channel_id
  group by s.posts_per_keyword;
$$;

-- A refine fixes the labeled posts it learns from; null when there are none since the last refine
create function refine_params(p_channel_id bigint) returns jsonb
language sql stable set search_path = public as $$
  select case when count(*) > 0 then jsonb_build_object('post_ids', jsonb_agg(id order by id)) end
  from posts
  where channel_id = p_channel_id and not learned
    and (score <> 0 or exists (select 1 from feedback f where f.post_id = posts.id));
$$;

-- Asks the next claim to refine the channel, or takes the ask back while no agent has claimed it
create function set_refine(p_channel_id bigint, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not owns_channel(p_channel_id) then raise exception 'only the channel owner can refine'; end if;
  if p_on then
    insert into tasks (channel_id, type, params) values (p_channel_id, 'refine', '{}') on conflict do nothing;
  else
    delete from tasks where channel_id = p_channel_id and type = 'refine' and status = 'queued';
  end if;
end $$;

-- A collect for the agent's next claim, outside the hourly slots; none when one is already open
create function run_now(p_channel_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not owns_channel(p_channel_id) then raise exception 'only the channel owner can run a collect'; end if;
  insert into tasks (channel_id, type, params, scheduled_for) values (p_channel_id, 'collect', '{}', now())
  on conflict do nothing;
end $$;

-- Hands the next task of the caller's channels to the calling agent, or null when there is none.
-- First it skips the collects of past slots still not done, and makes this slot's collect for each channel not
-- paused that has keywords and no collect yet this hour. Then it takes a refine first, else this hour's collect,
-- filling in its params. A task whose lease ran out goes back to the queue, and fails after its third try.
drop function claim_task();
create function claim_task()
returns tasks language plpgsql security definer set search_path = public as $$
declare
  slot timestamptz := date_trunc('hour', now());
  t tasks;
  p jsonb;
begin
  update channels set agent_claimed_at = now() where owner_id = auth.uid();

  update tasks set status = 'skipped', finished_at = now()
  where type = 'collect' and scheduled_for < slot and owns_channel(channel_id)
    and (status = 'queued' or (status = 'running' and lease_until < now()));

  insert into tasks (channel_id, type, params, scheduled_for)
  select s.channel_id, 'collect', '{}', slot
  from strategy s join channels c on c.id = s.channel_id
  where c.owner_id = auth.uid() and not s.paused
    and exists (select 1 from search_keywords k where k.channel_id = s.channel_id)
    and not exists (
      select 1 from tasks o where o.channel_id = s.channel_id and o.type = 'collect' and o.scheduled_for >= slot)
  order by s.channel_id
  on conflict do nothing;

  update tasks set status = 'failed', error = 'not completed after 3 tries', finished_at = now()
  where type <> 'init' and status = 'running' and lease_until < now() and attempts >= 3 and owns_channel(channel_id);

  loop
    select * into t from tasks
    where owns_channel(channel_id) and (type = 'refine' or (type = 'collect' and scheduled_for >= slot))
      and (status = 'queued' or (status = 'running' and lease_until < now()))
    order by type = 'refine' desc, scheduled_for, id
    limit 1
    for update skip locked;
    if not found then return null; end if;

    p := case t.type when 'collect' then collect_params(t.channel_id) else refine_params(t.channel_id) end;
    exit when p is not null;
    -- A refine with no new labels to learn from has nothing to do
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

revoke execute on function claim_task, collect_params, refine_params, set_refine, run_now from public, anon;
grant execute on function claim_task, set_refine, run_now to authenticated;
