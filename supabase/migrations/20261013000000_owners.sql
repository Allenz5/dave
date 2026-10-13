-- Sign-in is Google only. Each channel has an owner: only the owner labels its posts (votes, comments) and edits its
-- search keywords and filter prompt. Everyone, signed in or not, can read.
alter table channels add column owner_id uuid references auth.users on delete set null;

create function owns_channel(p_channel_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from channels where id = p_channel_id and owner_id = auth.uid());
$$;

create function owns_post(p_post_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select owns_channel((select channel_id from posts where id = p_post_id));
$$;

-- Labels belong to users. device_id stays only until the earlier anonymous labels are moved to their owner.
alter table post_votes add column user_id uuid references auth.users on delete cascade;
alter table post_votes drop constraint post_votes_pkey, alter column device_id drop not null;
create unique index post_votes_user on post_votes (post_id, user_id);

alter table comment_votes add column user_id uuid references auth.users on delete cascade;
alter table comment_votes drop constraint comment_votes_pkey, alter column device_id drop not null;
create unique index comment_votes_user on comment_votes (comment_id, user_id);

alter table comments add column user_id uuid references auth.users on delete set null;

-- Voting as the signed-in user; value is 1 / -1 / 0 (0 removes the vote). Returns the new score.
drop function vote_post(bigint, uuid, smallint);
drop function vote_comment(bigint, uuid, smallint);

create function vote_post(p_post_id bigint, p_value smallint)
returns int language plpgsql security definer set search_path = public as $$
declare
  old_value smallint := coalesce(
    (select value from post_votes where post_id = p_post_id and user_id = auth.uid()), 0);
  new_score int;
begin
  if not owns_post(p_post_id) then raise exception 'only the channel owner can vote'; end if;
  if p_value not in (-1, 0, 1) then raise exception 'invalid vote'; end if;
  if p_value = 0 then
    delete from post_votes where post_id = p_post_id and user_id = auth.uid();
  else
    insert into post_votes (post_id, user_id, value) values (p_post_id, auth.uid(), p_value)
      on conflict (post_id, user_id) do update set value = excluded.value;
  end if;
  update posts set score = score + p_value - old_value where id = p_post_id
    returning score into new_score;
  return new_score;
end $$;

create function vote_comment(p_comment_id bigint, p_value smallint)
returns int language plpgsql security definer set search_path = public as $$
declare
  old_value smallint := coalesce(
    (select value from comment_votes where comment_id = p_comment_id and user_id = auth.uid()), 0);
  new_score int;
begin
  if not owns_post((select post_id from comments where id = p_comment_id)) then
    raise exception 'only the channel owner can vote';
  end if;
  if p_value not in (-1, 0, 1) then raise exception 'invalid vote'; end if;
  if p_value = 0 then
    delete from comment_votes where comment_id = p_comment_id and user_id = auth.uid();
  else
    insert into comment_votes (comment_id, user_id, value) values (p_comment_id, auth.uid(), p_value)
      on conflict (comment_id, user_id) do update set value = excluded.value;
  end if;
  update comments set score = score + p_value - old_value where id = p_comment_id
    returning score into new_score;
  return new_score;
end $$;

revoke execute on function vote_post, vote_comment from public, anon;
grant execute on function vote_post, vote_comment to authenticated;

-- A new comment is signed with its author's Google name
create function sign_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.author_name := coalesce(
    (select raw_user_meta_data->>'full_name' from auth.users where id = auth.uid()), 'anonymous');
  return new;
end $$;

create trigger comments_sign before insert on comments
  for each row execute function sign_comment();

-- Writes: the channel owner only, and comments are edited by their author
drop policy "insert" on comments;
drop policy "edit" on comments;
drop policy "edit prompt" on strategy;
drop policy "add" on search_keywords;
drop policy "delete" on search_keywords;

create policy "owner comments" on comments for insert to authenticated
  with check (user_id = auth.uid() and owns_post(post_id));
create policy "author edits" on comments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner edits prompt" on strategy for update to authenticated
  using (owns_channel(channel_id)) with check (owns_channel(channel_id));
create policy "owner adds" on search_keywords for insert to authenticated
  with check (owns_channel(channel_id));
create policy "owner deletes" on search_keywords for delete to authenticated
  using (owns_channel(channel_id));

revoke insert, update, delete on comments, strategy, search_keywords from anon;
revoke insert, update on comments from authenticated;
grant insert (post_id, parent_id, body) on comments to authenticated;
grant update (body) on comments to authenticated;
