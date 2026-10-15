-- Feed pages list a channel's posts in the order the agent collected them, newest first
create or replace function feed_page(p_channel_id bigint, p_page int, p_page_size int default 10)
returns setof posts
language sql
stable
as $$
  select * from posts where channel_id = p_channel_id
  order by collected_at desc nulls last, id desc
  offset (p_page - 1) * p_page_size limit p_page_size;
$$;
