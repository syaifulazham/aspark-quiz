-- versions_update had no WITH CHECK, so the USING expression (status = 'draft')
-- was also applied to the NEW row — blocking draft -> published transitions.
drop policy versions_update on quiz_versions;

create policy versions_update on quiz_versions for update
  using (org_id = auth_org_id() and status = 'draft')
  with check (org_id = auth_org_id());
