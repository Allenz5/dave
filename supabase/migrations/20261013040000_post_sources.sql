-- When the agent checked a post with a web search, posts.body holds its short note and this the URLs it rests on.
alter table posts add column sources text[] not null default '{}';
