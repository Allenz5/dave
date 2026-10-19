-- A new channel's first collect runs on the server (the init-channel function), so the owner sees posts before
-- connecting an agent. It is tracked as a task of its own type, which agents never claim.
alter type task_type add value 'init';

create or replace function claim_task()
returns tasks language plpgsql security definer set search_path = public as $$
declare
  t tasks;
begin
  update tasks set status = 'failed', error = 'not completed after 3 tries', finished_at = now()
  where type <> 'init' and status = 'running' and lease_until < now() and attempts >= 3 and owns_channel(channel_id);

  select * into t from tasks
  where type <> 'init' and owns_channel(channel_id) and (status = 'queued' or (status = 'running' and lease_until < now()))
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
