-- No login: each device generates a device_id locally, which identifies who voted or commented.

create table channels (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  description text not null default '',
  -- Cover image; when null the app draws a pixel landscape instead.
  banner_url text,
  created_at timestamptz not null default now()
);

create table posts (
  id bigint generated always as identity primary key,
  channel_id bigint not null references channels on delete cascade,
  author_name text not null,
  title text,
  body text not null default '',
  image_url text,
  -- Embedded post from another platform; only its ID is stored, never its content.
  embed_provider text check (embed_provider in ('x', 'youtube')),
  embed_id text,
  score int not null default 0,
  comment_count int not null default 0,
  created_at timestamptz not null default now(),
  check ((embed_provider is null) = (embed_id is null)),
  -- A post without an embed must have a title.
  check (title is not null or embed_provider is not null)
);

create table comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references posts on delete cascade,
  parent_id bigint references comments on delete cascade,
  device_id uuid,
  author_name text not null default 'anonymous',
  body text not null check (length(trim(body)) between 1 and 10000),
  score int not null default 0,
  created_at timestamptz not null default now()
);
create index on comments (post_id);

create table post_votes (
  post_id bigint not null references posts on delete cascade,
  device_id uuid not null,
  value smallint not null check (value in (-1, 1)),
  primary key (post_id, device_id)
);

create table comment_votes (
  comment_id bigint not null references comments on delete cascade,
  device_id uuid not null,
  value smallint not null check (value in (-1, 1)),
  primary key (comment_id, device_id)
);

-- Comment count
create function bump_comment_count() returns trigger language plpgsql
security definer set search_path = public as $$
begin
  update posts set comment_count = comment_count + 1 where id = new.post_id;
  return new;
end $$;

create trigger comments_bump_count after insert on comments
  for each row execute function bump_comment_count();

-- Voting: value is 1 / -1 / 0 (0 removes the vote). Returns the new score.
create function vote_post(p_post_id bigint, p_device_id uuid, p_value smallint)
returns int language plpgsql security definer set search_path = public as $$
declare
  old_value smallint := coalesce(
    (select value from post_votes where post_id = p_post_id and device_id = p_device_id), 0);
  new_score int;
begin
  if p_value not in (-1, 0, 1) then raise exception 'invalid vote'; end if;
  if p_value = 0 then
    delete from post_votes where post_id = p_post_id and device_id = p_device_id;
  else
    insert into post_votes values (p_post_id, p_device_id, p_value)
      on conflict (post_id, device_id) do update set value = excluded.value;
  end if;
  update posts set score = score + p_value - old_value where id = p_post_id
    returning score into new_score;
  return new_score;
end $$;

create function vote_comment(p_comment_id bigint, p_device_id uuid, p_value smallint)
returns int language plpgsql security definer set search_path = public as $$
declare
  old_value smallint := coalesce(
    (select value from comment_votes where comment_id = p_comment_id and device_id = p_device_id), 0);
  new_score int;
begin
  if p_value not in (-1, 0, 1) then raise exception 'invalid vote'; end if;
  if p_value = 0 then
    delete from comment_votes where comment_id = p_comment_id and device_id = p_device_id;
  else
    insert into comment_votes values (p_comment_id, p_device_id, p_value)
      on conflict (comment_id, device_id) do update set value = excluded.value;
  end if;
  update comments set score = score + p_value - old_value where id = p_comment_id
    returning score into new_score;
  return new_score;
end $$;

-- Permissions: everyone can read; comments can be inserted directly; votes only go through the functions above.
alter table channels enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;
alter table post_votes enable row level security;
alter table comment_votes enable row level security;

create policy "read" on channels for select using (true);
create policy "read" on posts for select using (true);
create policy "read" on comments for select using (true);
create policy "read" on post_votes for select using (true);
create policy "read" on comment_votes for select using (true);
create policy "insert" on comments for insert
  with check (score = 0 and author_name = 'anonymous' and device_id is not null);

grant execute on function vote_post, vote_comment to anon;
