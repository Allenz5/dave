-- The keyword whose search found the post; refine counts each keyword's votes by it
alter table posts add column keyword_id bigint references search_keywords on delete set null;
grant insert (keyword_id) on posts to authenticated;

-- Finishes a running task with its result.
-- collect: {"keywords": [{"id", "last_posted_at", "collected", "kept", "stale"}]} moves each keyword's stop point
--   and records its run.
-- refine: {"prompt", "keywords": [query, ...], "changes", "keyword_changes"} replaces the channel's filter prompt
--   and keywords, and marks the task's posts learned.
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
  else
    if coalesce(trim(p_result->>'prompt'), '') = '' or jsonb_array_length(coalesce(p_result->'keywords', '[]')) = 0 then
      raise exception 'refine result needs a prompt and at least one keyword';
    end if;
    update strategy set filter_prompt = p_result->>'prompt' where channel_id = t.channel_id;
    delete from search_keywords
    where channel_id = t.channel_id and query not in (select jsonb_array_elements_text(p_result->'keywords'));
    insert into search_keywords (channel_id, query)
    select distinct t.channel_id, q from jsonb_array_elements_text(p_result->'keywords') q
    where not exists (select 1 from search_keywords where channel_id = t.channel_id and query = q);

    update posts set learned = true
    where channel_id = t.channel_id and id in (select jsonb_array_elements_text(t.params->'post_ids')::bigint);
  end if;

  update tasks set status = 'done', result = p_result, finished_at = now() where id = t.id returning * into t;
  return t;
end $$;
