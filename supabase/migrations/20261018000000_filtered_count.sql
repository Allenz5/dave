-- How many collected posts the filter dropped in a channel, for the attention it saved its owner. Runs as the caller,
-- so keyword_runs' policy keeps it to the owner's channels; a deleted keyword takes its runs with it.
create function filtered_count(p_channel_id bigint) returns bigint
language sql stable security invoker set search_path = public as $$
  select coalesce(sum(r.collected - r.kept), 0)
  from keyword_runs r join search_keywords k on k.id = r.keyword_id
  where k.channel_id = p_channel_id;
$$;

revoke execute on function filtered_count from public, anon;
grant execute on function filtered_count to authenticated;
