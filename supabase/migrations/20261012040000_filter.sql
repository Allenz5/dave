-- What agent/filter.mjs decided for a post. Null for posts that went in unfiltered; 'dropped' ones are a small
-- sample let into the feed so the reader can catch wrong drops.
alter table posts
  add column filter_decision text check (filter_decision in ('kept', 'dropped')),
  add column filter_reason text;

-- Every channel's filter prompt follows agent/prompts/template.md; the output format lives in agent/prompts/filter.md.
update strategy set filter_prompt = '## Reader
Someone who follows open source AI closely and wants what is new and real in it.

## Keep
- A concrete release or result: model weights, a repo, a dataset, a benchmark number. E.g. a lab publishing open weights with a model card.
- A substantive explanation of how an open model or tool works, with evidence. E.g. a thread comparing two open models on real tasks.

## Drop
- Ads, giveaways, engagement bait, and threads of generic tips.
- Hype with no substance in the post or its link. E.g. "open source is winning" with nothing behind it.

## Verify
- A claim that something is open source or open weights, when the post links nothing that shows it: search for the repo or weights.'
where channel_id = (select id from channels where slug = 'opensource');

update strategy set filter_prompt = '## Reader
Someone who follows AI startups closely and wants what is new and real in them.

## Keep
- Concrete company news: a launch, a funding round, a key hire, real traction numbers. E.g. a founder announcing a seed round with the amount and lead investor.
- A substantive account of how an AI company is built or run, with evidence. E.g. a founder sharing revenue and what drove it.

## Drop
- Ads, giveaways, engagement bait, and threads of generic tips.
- Hype with no substance in the post or its link. E.g. "AI startups will replace SaaS" with nothing behind it.

## Verify
- A funding or traction claim from an account that isn''t the company or a known outlet: search for the company and the round.'
where channel_id = (select id from channels where slug = 'startup');
