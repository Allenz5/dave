-- Whether refine has learned the post's current label (the owner's vote and feedback). Changing either resets it.
alter table posts add column learned boolean not null default false;

create function unlearn_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update posts set learned = false where id = coalesce(new.post_id, old.post_id);
  return null;
end $$;

create trigger post_votes_unlearn after insert or update or delete on post_votes
  for each row execute function unlearn_post();
create trigger feedback_unlearn after insert or update or delete on feedback
  for each row execute function unlearn_post();
