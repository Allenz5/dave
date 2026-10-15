-- How hard the agent searches each run: up to 5 / 10 / 15 / 20 / 30 posts per keyword for levels 1-5. The owner sets it.
alter table strategy add column crawl_intensity smallint not null default 2 check (crawl_intensity between 1 and 5);
grant update (crawl_intensity) on strategy to authenticated;

-- When the newest post each keyword's last search reached was posted; the next search stops once it scrolls back past it
alter table search_keywords add column last_posted_at timestamptz;
