-- Collected X posts go into their topic's channel as embeds (agent/sync.mjs); each post at most once per channel.
create unique index posts_channel_embed on posts (channel_id, embed_provider, embed_id);

-- A random sample of a channel's posts, one page of the feed.
create function sample_posts(p_channel_id bigint, p_limit int default 20)
returns setof posts
language sql
volatile
as $$
  select * from posts where channel_id = p_channel_id order by random() limit p_limit;
$$;

grant execute on function sample_posts to anon, authenticated;
