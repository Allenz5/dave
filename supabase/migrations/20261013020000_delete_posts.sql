-- The channel owner can delete a post from the feed; its votes and comments go with it.
create policy "owner deletes" on posts for delete to authenticated using (owns_channel(channel_id));
