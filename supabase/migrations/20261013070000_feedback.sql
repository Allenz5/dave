-- The owner's labels move off the public comments: a post's vote plus one feedback note, both seen only by the owner
-- and used to refine the channel's filter prompt. Comments become an open conversation for any signed-in user.
create table feedback (
  post_id bigint primary key references posts on delete cascade,
  body text not null,
  updated_at timestamptz not null default now()
);

alter table feedback enable row level security;
create policy "owner reads" on feedback for select to authenticated using (owns_post(post_id));
create policy "owner adds" on feedback for insert to authenticated with check (owns_post(post_id));
create policy "owner edits" on feedback for update to authenticated using (owns_post(post_id)) with check (owns_post(post_id));
create policy "owner deletes" on feedback for delete to authenticated using (owns_post(post_id));
revoke all on feedback from anon;

-- The owner's top-level comments so far were labels: they become the post's feedback
insert into feedback (post_id, body, updated_at)
select distinct on (c.post_id) c.post_id, c.body, c.created_at
from comments c join posts p on p.id = c.post_id join channels ch on ch.id = p.channel_id
where c.parent_id is null and c.user_id = ch.owner_id
order by c.post_id, c.created_at desc;

delete from comments c using posts p, channels ch
where p.id = c.post_id and ch.id = p.channel_id and c.parent_id is null and c.user_id = ch.owner_id
  and not exists (select 1 from comments r where r.parent_id = c.id);

update posts set comment_count = (select count(*) from comments where post_id = posts.id);

drop policy "owner comments" on comments;
create policy "signed-in comments" on comments for insert to authenticated with check (user_id = auth.uid());
