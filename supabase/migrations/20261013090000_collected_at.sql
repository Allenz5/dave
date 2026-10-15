-- When the agent collected the post; created_at is when it was posted on X
alter table posts add column collected_at timestamptz;
