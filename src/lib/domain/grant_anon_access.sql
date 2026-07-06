-- Run this in Supabase SQL Editor. Grants the minimum access needed for
-- the browser app (using the PUBLISHABLE key, never the secret key) to
-- read relationships/contacts and log actions taken from the Command Center.
--
-- Scope is deliberately narrow: only what today's UI actually uses.
-- Revisit before this app is ever deployed somewhere public — see the
-- note in useStore.ts about moving to Supabase Auth + per-user RLS then.

grant usage on schema public to anon;

grant select on contacts to anon;
grant select, update on relationships to anon;
grant select, insert on relationship_events to anon;

-- RLS is already enabled on every table with no policies (from project
-- setup). These policies open exactly the operations granted above —
-- permissive ("true") since this is a single-tenant, non-public app today.

create policy "dev_anon_read_contacts" on contacts
  for select using (true);

create policy "dev_anon_read_relationships" on relationships
  for select using (true);

create policy "dev_anon_update_relationships" on relationships
  for update using (true);

create policy "dev_anon_read_relationship_events" on relationship_events
  for select using (true);

create policy "dev_anon_insert_relationship_events" on relationship_events
  for insert with check (true);
