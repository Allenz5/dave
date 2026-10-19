-- The owner adds an empty channel, which they set up on its page; returns its public id for the URL
create function add_channel() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  ch bigint;
  pid uuid;
begin
  if auth.uid() is null then raise exception 'sign in to add a channel'; end if;
  ch := create_channel(auth.uid());
  update channels set name = 'New channel' where id = ch returning public_id into pid;
  return pid;
end $$;
revoke execute on function add_channel from public, anon;
grant execute on function add_channel to authenticated;
