-- Every user has a channel of their own from the start, and renames their channels.

-- The old home page's channel cards, description and cover image are gone from the app
drop function channel_cards();
alter table channels drop column description, drop column banner_url;

alter table channels add constraint channels_name_length check (length(trim(name)) between 1 and 80);

-- An empty channel: no keywords and an empty rubric, which the owner fills in
create function create_channel(p_owner uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  ch bigint;
begin
  insert into channels (slug, name, owner_id)
  values ('c-' || substr(md5(gen_random_uuid()::text), 1, 8), 'My channel', p_owner)
  returning id into ch;
  insert into strategy (channel_id, filter_prompt) values (ch, '');
  return ch;
end $$;
revoke execute on function create_channel from public, anon, authenticated;

create function create_first_channel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform create_channel(new.id);
  return new;
end $$;

create trigger users_first_channel after insert on auth.users
  for each row execute function create_first_channel();

-- Users who signed up before this
select create_channel(u.id) from auth.users u where not exists (select 1 from channels where owner_id = u.id);

create policy "owner renames" on channels for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke update on channels from anon, authenticated;
grant update (name) on channels to authenticated;
