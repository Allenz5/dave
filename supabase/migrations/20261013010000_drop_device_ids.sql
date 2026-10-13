-- Every label now belongs to a signed-in user; the anonymous device ids are gone.
alter table post_votes drop column device_id, alter column user_id set not null;
drop index post_votes_user;
alter table post_votes add primary key (post_id, user_id);

alter table comment_votes drop column device_id, alter column user_id set not null;
drop index comment_votes_user;
alter table comment_votes add primary key (comment_id, user_id);

alter table comments drop column device_id;
