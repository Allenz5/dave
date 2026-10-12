-- Each topic is its own channel, with the agent's strategy for it: the X search keywords, and the prompt it filters results with.
-- Editable from the app without login. data/collect.mjs keeps its own copy of the keywords; keep the two in sync by hand.
insert into channels (slug, name, description) values
  ('opensource', 'opensource', 'Open source AI: new models, repos and releases.'),
  ('startup', 'startup', 'AI startups: launches, funding rounds and the people building them.');

create table strategy (
  channel_id bigint primary key references channels on delete cascade,
  source text not null,
  frequency text not null,
  per_keyword int not null,
  filter_prompt text not null
);

create table search_keywords (
  id bigint generated always as identity primary key,
  channel_id bigint not null references channels on delete cascade,
  query text not null check (length(trim(query)) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (channel_id, query)
);

alter table strategy enable row level security;
alter table search_keywords enable row level security;
create policy "read" on strategy for select using (true);
create policy "read" on search_keywords for select using (true);
create policy "edit prompt" on strategy for update using (true) with check (true);
create policy "add" on search_keywords for insert with check (true);
create policy "delete" on search_keywords for delete using (true);
-- Only the prompt is editable, and a new keyword only sets its channel and text
revoke update on strategy from anon, authenticated;
grant update (filter_prompt) on strategy to anon, authenticated;
revoke insert, update on search_keywords from anon, authenticated;
grant insert (channel_id, query) on search_keywords to anon, authenticated;

insert into strategy (channel_id, source, frequency, per_keyword, filter_prompt)
select id, 'X · Latest', 'Every 2 hours, 08:00 – 00:00', 10, prompt
from channels join (values
  ('opensource', 'You screen X posts about open source AI.

Keep a post only if it is worth reading for someone who follows open source AI closely:
- It announces or explains something concrete: a model or weights release, a repo, a benchmark result.
- The substance is in the post or its link, not only in hype.

Drop it if it is an ad, engagement bait, a giveaway, a thread of generic tips, or off-topic.

Reply with KEEP or DROP and one sentence of reason.'),
  ('startup', 'You screen X posts about AI startups.

Keep a post only if it is worth reading for someone who follows AI startups closely:
- It announces or explains something concrete: a launch, a funding round, a hire, real traction numbers.
- The substance is in the post or its link, not only in hype.

Drop it if it is an ad, engagement bait, a giveaway, a thread of generic tips, or off-topic.

Reply with KEEP or DROP and one sentence of reason.')
) as p (slug, prompt) using (slug);

insert into search_keywords (channel_id, query)
select id, query
from channels join (values
  ('opensource', '"open source" AI'),
  ('opensource', '"open-source" LLM'),
  ('opensource', '"open weights"'),
  ('opensource', 'url:github.com LLM'),
  ('opensource', 'url:github.com "AI agent"'),
  ('opensource', '"just open sourced"'),
  ('startup', '"we raised" AI'),
  ('startup', '"seed round" AI'),
  ('startup', '"Series A" AI'),
  ('startup', '"launching today" AI'),
  ('startup', '"just launched" AI startup'),
  ('startup', '"YC" AI startup')
) as k (slug, query) using (slug);
