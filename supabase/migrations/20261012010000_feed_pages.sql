-- The feed is paged: 10 posts a page, in a fixed shuffled order so a page shows the same posts every time.
drop function sample_posts;

create function feed_page(p_channel_id bigint, p_page int, p_page_size int default 10)
returns setof posts
language sql
stable
as $$
  select * from posts
  where channel_id = p_channel_id
  order by md5(id::text)
  offset (p_page - 1) * p_page_size
  limit p_page_size;
$$;

grant execute on function feed_page to anon, authenticated;
