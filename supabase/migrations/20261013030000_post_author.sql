-- Posts are reposted by the agent, so they carry no author of their own; the column stays, empty.
alter table posts alter column author_name drop not null;
update posts set author_name = null;
