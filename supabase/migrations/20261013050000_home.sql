-- Home page: featured channels on top, then every channel by its latest post.
alter table channels add column featured boolean not null default false;
update channels set featured = true where slug in ('opensource', 'startup');

create function channel_cards()
returns table (
  id bigint, slug text, name text, description text, banner_url text, featured boolean,
  post_count bigint, last_post_at timestamptz
)
language sql stable as $$
  select c.id, c.slug, c.name, c.description, c.banner_url, c.featured, count(p.id), max(p.created_at)
  from channels c left join posts p on p.channel_id = c.id
  group by c.id
  order by max(p.created_at) desc nulls last;
$$;

grant execute on function channel_cards to anon, authenticated;
