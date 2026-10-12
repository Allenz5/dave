-- No login yet, so anyone can edit any comment's text; only the body is editable.
create policy "edit" on comments for update using (true) with check (true);
revoke update on comments from anon, authenticated;
grant update (body) on comments to anon, authenticated;
