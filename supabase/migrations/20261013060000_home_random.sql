-- The home page picks featured channels at random, so channels need no featured flag.
drop function channel_cards();
alter table channels drop column featured;

create function channel_cards()
returns table (
  id bigint, slug text, name text, description text, banner_url text, post_count bigint, last_post_at timestamptz
)
language sql stable as $$
  select c.id, c.slug, c.name, c.description, c.banner_url, count(p.id), max(p.created_at)
  from channels c left join posts p on p.channel_id = c.id
  group by c.id;
$$;

grant execute on function channel_cards to anon, authenticated;
