-- ============================================================
-- RIOS (Relationship Intelligence Operating System) — Schema v1
-- Target: Supabase Postgres
-- ============================================================
--
-- This schema reflects the domain model agreed across design
-- discussion, grounded in the actual BW_LinkedIn_Master dataset
-- (3,861 contacts) and the live Outreach_Log / Conversation_Log
-- tabs already in production use.
--
-- Design decisions this file encodes:
--   1. contacts = identity only, org-agnostic. Same person can
--      have relationships under multiple organisations later.
--      This is a deliberate exception to "every table has
--      organisation_id" — contacts are the one identity layer
--      that is intentionally shared across orgs.
--   2. relationships = business context, one per (org, contact).
--      Carries the full intelligence scoring, goal, stage, cadence.
--   3. relationship_memory = structured, append-only facts
--      ("prefers WhatsApp", "decision maker is the CTO").
--      Never overwritten — superseded facts get a new row.
--   4. relationship_events = append-only timeline. Covers
--      messages AND non-message events (stage changes, score
--      updates, imports, merges) per Constitution doctrine #2/#7.
--   5. Scores keep ONE current value on relationships; every
--      change is a relationship_event of type 'score_updated'.
--      No parallel manual/ai/effective columns — see design
--      conversation for why that doesn't scale.
--   6. targeting_rules / targeting_runs give an auditable,
--      deterministic "why did this show up today" trail.
--   7. Multi-tenant, subscription tier, and role columns exist
--      from day one — no enforcement logic yet, per doctrine
--      "expand, never contract."
--
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- ENUM TYPES
-- ============================================================

create type subscription_tier as enum ('free', 'pro', 'enterprise');

create type user_role as enum ('owner', 'manager', 'user');

-- Canonical lifecycle, per RIOS_D3_Screen1_Notes.md. A relationship
-- never exits this list — it only advances or occasionally reverts.
create type relationship_stage as enum (
  'Discovered',
  'Connected',
  'Recognized',
  'Rapport',
  'Trust',
  'Business Context',
  'Need Identified',
  'Solution Alignment',
  'Commercial Interest',
  'Meeting',
  'RFQ',
  'Quotation',
  'Negotiation',
  'Purchase Order',
  'Execution',
  'Repeat Business',
  'Strategic Partner',
  'Advocate'
);

create type relationship_temperature as enum ('Cold', 'Warm', 'Hot');

create type buying_authority_level as enum (
  'Unknown',
  'Recommender',
  'Technical Approver',
  'Influencer',
  'Budget Holder',
  'Direct Decision Maker'
);

create type fit_label as enum ('Low', 'Medium', 'High');

create type confidence_level as enum ('Low', 'Medium', 'High');

-- Outreach_Status values actually observed in production sheet,
-- plus 'nurture' as the default resting state.
create type outreach_status as enum (
  'nurture',
  'contacted',
  'engaged',
  'not_interested',
  'opted_out',
  'do_not_contact'
);

create type contact_channel as enum ('LinkedIn', 'Email', 'WhatsApp', 'Phone');

create type event_type as enum (
  'message_sent',
  'message_received',
  'stage_changed',
  'goal_changed',
  'score_updated',
  'memory_updated',
  'note_added',
  'imported',
  'duplicate_merged'
);

-- Reply classification vocabulary, taken directly from the
-- Apps Script analyzeConversation_ prompt already in production.
create type reply_classification as enum (
  'Positive',
  'Neutral',
  'Negative',
  'Info_Request',
  'Not_Interested',
  'Bounced'
);

-- Buyer's-journey signal extracted from a conversation. Distinct
-- from relationship_stage (lifecycle) — this is transient intent.
create type buying_signal_stage as enum (
  'Awareness',
  'Interest',
  'Consideration',
  'Intent',
  'Closed_Won',
  'Closed_Lost'
);

-- Constrained goal vocabulary. Postgres enums can only grow (ADD VALUE),
-- never shrink — which matches "expand, never contract" doctrine exactly.
create type relationship_goal_type as enum (
  'Commercial Discovery',
  'Repeat Business',
  'Strategic Partnership',
  'Funding',
  'Recruitment',
  'Vendor Qualification'
);

create type work_item_category as enum (
  'Critical',
  'Commitment',
  'Commercial',
  'Relationship Building',
  'Nurture'
);

create type work_item_status as enum ('pending', 'in_progress', 'completed', 'skipped');

-- ============================================================
-- updated_at trigger helper
-- ============================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- ORGANISATIONS
-- ============================================================

create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subscription_tier subscription_tier not null default 'free',
  -- Default goal applied to new relationships unless overridden.
  default_goal relationship_goal_type not null default 'Commercial Discovery',
  default_lifecycle_target relationship_stage not null default 'Purchase Order',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_organisations_updated_at
  before update on organisations
  for each row execute function set_updated_at();

-- ============================================================
-- USERS (simple role model, no permission enforcement yet)
-- ============================================================

create table app_users (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  email text not null unique,
  full_name text,
  role user_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_app_users_organisation on app_users(organisation_id);

create trigger trg_app_users_updated_at
  before update on app_users
  for each row execute function set_updated_at();

-- ============================================================
-- CONTACTS — identity layer, intentionally org-agnostic
-- ============================================================

create table contacts (
  id uuid primary key default gen_random_uuid(),
  -- Matching keys: each independently unique when present, none
  -- required. Import dedup checks all three, never relies on one.
  linkedin_url text unique,
  email text unique,
  phone text unique,
  first_name text not null,
  last_name text,
  country text,
  region text,
  connected_on date,
  custom_attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant insert on contacts to anon;
create policy "dev_anon_insert_contacts" on contacts for insert with check (true);

create index idx_contacts_country on contacts(country);

create trigger trg_contacts_updated_at
  before update on contacts
  for each row execute function set_updated_at();

-- ============================================================
-- RELATIONSHIPS — the primary entity, per Constitution
-- ============================================================

create table relationships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  owner_user_id uuid references app_users(id) on delete set null,

  -- Business context — belongs here, not on contacts, since the same
  -- person can hold different companies/positions across relationships
  -- or over time (e.g. changes jobs; the contact stays the same person).
  company text,
  position text,

  -- Goal & lifecycle — configurable, not hardcoded
  goal relationship_goal_type not null,  -- copied from org default_goal at creation, overridable
  stage relationship_stage not null default 'Discovered',

  -- Composite intelligence score and its six components.
  -- icp_score = role_influence_score + buying_authority_score
  --           + company_relevance_score + commercial_fit_score
  --           + geography_score + relationship_proximity_score
  -- (verified against source data — this identity always holds)
  icp_score int not null default 0,
  icp_tier text,                          -- Tier_A / Tier_B / Tier_C / Tier_D — derived bucket
  role_influence_score int not null default 0,
  buying_authority buying_authority_level not null default 'Unknown',
  buying_authority_score int not null default 0,
  company_relevance_score int not null default 0,
  commercial_fit_score int not null default 0,     -- was Fit_Score / Expected_BW_Fit numeric
  commercial_fit_label fit_label,                  -- was Expected_BW_Fit label
  geography_score int not null default 0,
  relationship_proximity_score int not null default 0,  -- was Relationship_Score
  classification_confidence confidence_level,

  -- Persona / segmentation (renamed from BW_ prefixed originals)
  persona text,                           -- was BW_Persona
  role_category text,
  role_seniority text,
  company_type text,
  campaign_name text,

  -- Working state
  relationship_temperature relationship_temperature not null default 'Cold',
  relationship_strategy text,             -- was Relationship_Strategy
  next_best_action text,
  outreach_status outreach_status not null default 'nurture',
  touch_number int not null default 0,
  next_touch_due date,
  last_outreach_date date,
  last_outreach_channel contact_channel,
  last_reply_date date,
  last_reply_classification reply_classification,

  custom_attributes jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organisation_id, contact_id)
);

alter table relationships add column is_committed boolean not null default false;

grant insert on relationships to anon;
create policy "dev_anon_insert_relationships" on relationships for insert with check (true);

create index idx_relationships_org on relationships(organisation_id);
create index idx_relationships_contact on relationships(contact_id);
create index idx_relationships_stage on relationships(stage);
create index idx_relationships_icp_tier on relationships(icp_tier);
create index idx_relationships_next_touch_due on relationships(next_touch_due);
create index idx_relationships_outreach_status on relationships(outreach_status);
create index idx_relationships_goal on relationships(goal);
create index idx_relationships_company on relationships(company);
create index idx_relationships_owner on relationships(owner_user_id);

create trigger trg_relationships_updated_at
  before update on relationships
  for each row execute function set_updated_at();

-- ============================================================
-- RELATIONSHIP MEMORY — structured, append-only facts
-- ============================================================

create table relationship_memory (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references relationships(id) on delete cascade,
  fact_type text not null,           -- e.g. 'preferred_channel', 'actual_decision_maker'
  value text not null,
  confidence confidence_level not null default 'Medium',
  source text not null,              -- 'import' | 'ai_research' | 'interaction_extracted' | 'user_input'
  superseded_by uuid references relationship_memory(id),  -- null = currently active fact
  recorded_at timestamptz not null default now()
);

create index idx_relationship_memory_relationship on relationship_memory(relationship_id);
create index idx_relationship_memory_fact_type on relationship_memory(relationship_id, fact_type);

-- ============================================================
-- RELATIONSHIP EVENTS — append-only timeline (everything is an event)
-- ============================================================

create table relationship_events (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references relationships(id) on delete cascade,
  event_type event_type not null,

  -- Populated for message_sent / message_received events
  direction text,                     -- 'Sent' | 'Received'
  channel contact_channel,
  message_text text,
  message_date date,
  reply_classification reply_classification,
  buying_signal_stage buying_signal_stage,
  extracted_email text,
  extracted_signal text,

  -- Populated for score_updated / stage_changed / goal_changed events
  field_name text,
  old_value text,
  new_value text,
  reason text,

  source text not null default 'manual',  -- 'manual' | 'api' | 'import' | 'ai'
  batch_id text,
  touch_number int,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index idx_relationship_events_relationship on relationship_events(relationship_id, created_at desc);
create index idx_relationship_events_type on relationship_events(event_type);

-- ============================================================
-- TARGETING RULES & RUNS — deterministic, explainable segments
-- ============================================================

create table targeting_rules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  is_system boolean not null default false,  -- true = immutable (e.g. exclude opted-out)
  -- v1: single boolean_operator applies to the whole rule set (all AND or all OR).
  -- No nested groups yet — see design conversation for why.
  boolean_operator text not null default 'AND' check (boolean_operator in ('AND', 'OR')),
  logic jsonb not null,   -- [{ "field": "icp_tier", "operator": "=", "value": "Tier_A" }, ...]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_targeting_rules_org on targeting_rules(organisation_id);

create trigger trg_targeting_rules_updated_at
  before update on targeting_rules
  for each row execute function set_updated_at();

create table targeting_runs (
  id uuid primary key default gen_random_uuid(),
  targeting_rule_id uuid not null references targeting_rules(id) on delete cascade,
  run_at timestamptz not null default now(),
  matched_count int not null default 0,
  matched_relationship_ids uuid[] not null default '{}'
);

create index idx_targeting_runs_rule on targeting_runs(targeting_rule_id, run_at desc);

-- ============================================================
-- WORK ITEMS — the actual Command Center queue
-- ============================================================

create table work_items (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references relationships(id) on delete cascade,
  targeting_run_id uuid references targeting_runs(id) on delete set null,
  category work_item_category not null,
  title text not null,
  next_action text,
  status work_item_status not null default 'pending',
  estimated_minutes int not null default 5,
  due_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_work_items_relationship on work_items(relationship_id);
create index idx_work_items_status on work_items(status);
create index idx_work_items_category on work_items(category);
create index idx_work_items_due_at on work_items(due_at);

-- ============================================================
-- SEED: default organisation + system-level targeting rules
-- ============================================================

insert into organisations (name, subscription_tier, default_goal, default_lifecycle_target)
values ('BW Technologies', 'free', 'Commercial Discovery'::relationship_goal_type, 'Purchase Order');

-- System rule: never surface opted-out / do-not-contact relationships.
-- is_system = true means this cannot be edited or deleted from the UI.
insert into targeting_rules (organisation_id, name, is_system, boolean_operator, logic)
select id, 'Exclude opted-out', true, 'OR',
  '[{"field": "outreach_status", "operator": "IN", "value": ["opted_out", "do_not_contact"]}]'::jsonb
from organisations where name = 'BW Technologies';

-- ============================================================
-- IMPORT MAPPING REFERENCE (for the import script — not executed here)
-- ============================================================
-- Master tab column          -> schema field
-- ----------------------------------------------------------
-- Contact_ID                 -> (discarded — replaced by contacts.id / relationships.id)
-- First Name, Last Name      -> contacts.first_name, contacts.last_name
-- URL                        -> contacts.linkedin_url
-- Email Address              -> contacts.email
-- Company, Position          -> relationships.company, relationships.position
--                                (NOT contacts — see schema note on why)
-- Connected On               -> contacts.connected_on (parse 'DD-Mon-YY')
-- Country, Region            -> contacts.country, contacts.region
-- Role_Category               -> relationships.role_category
-- Role_Seniority               -> relationships.role_seniority
-- Role_Influence_Score        -> relationships.role_influence_score
-- Buying_Authority             -> relationships.buying_authority
-- Buying_Authority_Score      -> relationships.buying_authority_score
-- BW_Persona                   -> relationships.persona
-- Company_Type                 -> relationships.company_type
-- Company_Relevance_Score     -> relationships.company_relevance_score
-- Expected_BW_Fit               -> relationships.commercial_fit_label
-- Fit_Score                     -> relationships.commercial_fit_score
-- Geography_Score              -> relationships.geography_score
-- Relationship_Score            -> relationships.relationship_proximity_score
-- Relationship_Temperature     -> relationships.relationship_temperature
-- Campaign_Name                 -> relationships.campaign_name
-- Relationship_Strategy         -> relationships.relationship_strategy
-- Next_Best_Action               -> relationships.next_best_action
-- ICP_Score / BW_ICP_Score      -> relationships.icp_score
-- ICP_Tier / Priority_Tier      -> relationships.icp_tier
-- Classification_Confidence    -> relationships.classification_confidence
-- Outreach_Status                -> relationships.outreach_status (lowercase)
-- Touch_Number                   -> relationships.touch_number
-- Next_Touch_Due                 -> relationships.next_touch_due
-- Last_Outreach_Date             -> relationships.last_outreach_date
-- Last_Outreach_Channel          -> relationships.last_outreach_channel
-- Last_Reply_Date                -> relationships.last_reply_date
-- Last_Reply_Classification    -> relationships.last_reply_classification
-- Intelligence_Notes             -> split on '\n---\n', one relationship_memory
--                                    row per entry (fact_type='intelligence_note',
--                                    source='import')
--
-- Outreach_Log rows  -> one relationship_events row per sent message
--                       (event_type='message_sent', source='import')
-- Conversation_Log rows -> one relationship_events row per turn
--                       (event_type='message_sent'/'message_received', source='import')
-- ============================================================

-- ============================================================
-- KNOWLEDGE CENTER — plain-text markdown documents, v1
-- ============================================================
-- Metadata (category/tags/visibility) is for UI filtering and manual
-- document selection today, NOT automatic relevance matching — that's
-- deferred to a later version using pgvector, once document volume
-- actually requires it. See design conversation for why.
--
-- 'restricted' visibility means "don't show in a future browsing UI to
-- e.g. a junior team member" — it does NOT mean "hide from the AI."
-- The Reply Assistant automatically includes ALL active documents
-- regardless of visibility, since the owner needs the AI to actually
-- know real margin/pricing logic to write commercially sound replies.

create type knowledge_visibility as enum ('organization', 'restricted');

create table knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  title text not null,
  category text not null,        -- e.g. 'company', 'product', 'sales', 'commercial', 'voice'
  content text not null,          -- the full markdown body, stored as plain text
  tags text[] not null default '{}',
  visibility knowledge_visibility not null default 'organization',
  is_active boolean not null default true,  -- retire a doc from AI use without deleting it
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organisation_id, title)
);

create index idx_knowledge_documents_org on knowledge_documents(organisation_id);
create index idx_knowledge_documents_category on knowledge_documents(category);
create index idx_knowledge_documents_active on knowledge_documents(is_active);

create trigger trg_knowledge_documents_updated_at
  before update on knowledge_documents
  for each row execute function set_updated_at();

grant select on knowledge_documents to anon;

create policy "dev_anon_read_knowledge_documents" on knowledge_documents
  for select using (is_active = true);

-- ============================================================
-- DEV-MODE ACCESS GRANTS — single-tenant, non-public app today.
-- Consolidates every grant/policy applied ad hoc across the project so
-- this file is genuinely the single source of truth, not just for table
-- shape but for what's actually reachable via the anon/publishable key.
-- Revisit before any public deployment — see design conversation.
-- ============================================================

grant select on contacts to anon;
create policy "dev_anon_read_contacts" on contacts for select using (true);

grant select, update on relationships to anon;
create policy "dev_anon_read_relationships" on relationships for select using (true);
create policy "dev_anon_update_relationships" on relationships for update using (true);

grant select, insert, update, delete on relationship_events to anon;
create policy "dev_anon_read_relationship_events" on relationship_events for select using (true);
create policy "dev_anon_insert_relationship_events" on relationship_events for insert with check (true);
create policy "dev_anon_update_relationship_events" on relationship_events for update using (true);
create policy "dev_anon_delete_relationship_events" on relationship_events for delete using (true);

grant select on work_items to anon;
create policy "dev_anon_read_work_items" on work_items for select using (true);

grant select, insert on relationship_memory to anon;
create policy "dev_anon_read_relationship_memory" on relationship_memory for select using (true);
create policy "dev_anon_insert_relationship_memory" on relationship_memory for insert with check (true);

-- ============================================================
-- AI FEEDBACK — capture-only for now (edits, guidance), pure data
-- collection toward a future "learned preferences" system. Nothing reads
-- or acts on this table yet. Follows the same pattern as relationship_events:
-- no organisation_id column, derivable via relationship_id join.
-- ============================================================

create table ai_feedback (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid references relationships(id) on delete cascade,
  feedback_type text not null, -- 'reply_edited' | 'guidance_given'
  ai_output text,
  user_correction text,
  created_at timestamptz not null default now()
);

grant select, insert on ai_feedback to anon;
create policy "dev_anon_read_ai_feedback" on ai_feedback for select using (true);
create policy "dev_anon_insert_ai_feedback" on ai_feedback for insert with check (true);

-- ============================================================
-- COMPANIES — first entity in the relationship graph, alongside
-- contacts. Deliberately org-agnostic, same documented exception as
-- contacts. Rich/evolving intel lives in custom_attributes JSONB per
-- doctrine. Deliberately step 1 of a much bigger relationship-graph
-- direction (mutual connections, projects/technologies as entities,
-- path-finding, visualization) — all explicitly deferred to its own
-- dedicated session.
-- ============================================================

create extension if not exists pg_trgm;

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text unique,
  linkedin_url text unique,
  industry text,
  hq_country text,
  employee_count_range text,
  description text,
  custom_attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table companies add column website text;
alter table companies add column hq_address text;
alter table companies add column linkedin_follower_count int;

create index idx_companies_name on companies(name);
create index idx_companies_name_trgm on companies using gin (name gin_trgm_ops);

create trigger trg_companies_updated_at
  before update on companies
  for each row execute function set_updated_at();

alter table relationships add column company_id uuid references companies(id) on delete set null;
create index idx_relationships_company_id on relationships(company_id);

grant select, insert, update on companies to anon;
create policy "dev_anon_read_companies" on companies for select using (true);
create policy "dev_anon_insert_companies" on companies for insert with check (true);
create policy "dev_anon_update_companies" on companies for update using (true);

create or replace function search_similar_companies(search_name text, min_similarity float default 0.3)
returns table (
  id uuid, name text, domain text, linkedin_url text, industry text,
  hq_country text, employee_count_range text, description text,
  custom_attributes jsonb, similarity real
)
language sql stable
as $$
  select c.id, c.name, c.domain, c.linkedin_url, c.industry, c.hq_country,
         c.employee_count_range, c.description, c.custom_attributes,
         similarity(c.name, search_name) as similarity
  from companies c
  where similarity(c.name, search_name) > min_similarity
  order by similarity desc
  limit 5;
$$;

grant execute on function search_similar_companies(text, float) to anon;

-- ============================================================
-- DAILY RELATIONSHIP SWEEP — one-time, project-wide cron setup.
-- Registered ONCE, ever, for the whole project — NOT per-organisation.
-- The sweep function itself loops through every row in `organisations`
-- and gates per-org based on daily_sweep_hour_utc/daily_sweep_last_run_date,
-- so a newly onboarded organisation is picked up automatically the very
-- next time this already-running schedule fires — no new SQL, no code
-- change, no per-org cron registration ever needed.
-- ============================================================

alter table organisations add column daily_new_touch_cap int not null default 50;
alter table organisations add column daily_sweep_hour_utc int not null default 7;
alter table organisations add column daily_sweep_last_run_date date;

alter table relationships add column excluded_until date;
alter table relationships add column exclusion_reason text;
alter table relationships add column archived_at timestamptz;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Run this once per environment (dev, staging, prod each need their own
-- registration, since cron.job lives inside each database individually).
-- select cron.schedule(
--   'daily-relationship-sweep-check',
--   '*/15 * * * *',
--   $$
--   select net.http_post(
--     url:='https://ovnmovpchupuqstxsxrs.supabase.co/functions/v1/daily-relationship-sweep',
--     headers:='{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
--     body:='{}'::jsonb
--   );
--   $$
-- );

create table contact_connections (
  id uuid primary key default gen_random_uuid(),
  contact_id_a uuid not null references contacts(id) on delete cascade,
  contact_id_b uuid not null references contacts(id) on delete cascade,
  source text not null default 'linkedin_mutual', -- 'linkedin_mutual' | 'manual'
  discovered_via_relationship_id uuid references relationships(id) on delete set null, -- whose enrichment surfaced this
  created_at timestamptz not null default now(),

  unique (contact_id_a, contact_id_b)
);

alter table contact_connections add column if not exists shared_connections text;

alter table contact_connections add column if not exists connection_degree text;

grant update on contact_connections to anon;
create policy "dev_anon_update_contact_connections" on contact_connections for update using (true);

create index idx_contact_connections_a on contact_connections(contact_id_a);
create index idx_contact_connections_b on contact_connections(contact_id_b);

create table contact_employment_history (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  company_name_raw text not null, -- fallback if this specific employer hasn't been deduped into a real company row yet
  position text,
  start_date date,
  end_date date, -- null = current role
  created_at timestamptz not null default now()
);

create index idx_employment_history_contact on contact_employment_history(contact_id);
create index idx_employment_history_company on contact_employment_history(company_id);

grant select, insert on contact_employment_history to anon;
create policy "dev_anon_read_employment_history" on contact_employment_history for select using (true);
create policy "dev_anon_insert_employment_history" on contact_employment_history for insert with check (true);

grant select, insert on contact_connections to anon;
create policy "dev_anon_read_contact_connections" on contact_connections for select using (true);
create policy "dev_anon_insert_contact_connections" on contact_connections for insert with check (true);

-- AI model preferences per organisation
alter table organisations 
  add column ai_analysis_model text not null default 'gpt-4o-mini',
  add column ai_draft_model text not null default 'gpt-4o-mini';

-- Cadence tracking for Funnel 1
alter table relationships
  add column cadence_step int not null default 0;

grant select, update on organisations to anon;
create policy "dev_anon_read_organisations" on organisations for select using (true);
create policy "dev_anon_update_organisations" on organisations for update using (true);

-- 1. Teach the database two new event types
alter type event_type add value if not exists 'archived';
alter type event_type add value if not exists 'unarchived';

-- 2. Standing rule: never show archived contacts anywhere
insert into targeting_rules (organisation_id, name, is_system, boolean_operator, logic)
select id, 'Exclude archived', true, 'OR',
  '[{"field": "archived_at", "operator": "IS NOT NULL", "value": null}]'::jsonb
from organisations
where not exists (
  select 1 from targeting_rules
  where name = 'Exclude archived' and organisation_id = organisations.id
);

-- 3. The "Archive one contact" command
create or replace function archive_relationship(
  p_relationship_id uuid,
  p_reason text default 'Not specified'
)
returns void
language plpgsql
as $$
begin
  update relationships
  set archived_at = now(),
      outreach_status = 'do_not_contact',
      exclusion_reason = p_reason,
      excluded_until = null
  where id = p_relationship_id;

  update work_items
  set status = 'skipped'
  where relationship_id = p_relationship_id
    and status = 'pending';

  insert into relationship_events (relationship_id, event_type, reason, source)
  values (p_relationship_id, 'archived', p_reason, 'manual');
end;
$$;

grant execute on function archive_relationship(uuid, text) to anon;

-- 4. The "Undo archive" command
create or replace function unarchive_relationship(
  p_relationship_id uuid
)
returns void
language plpgsql
as $$
begin
  update relationships
  set archived_at = null,
      exclusion_reason = null,
      outreach_status = 'nurture',
      next_touch_due = current_date
  where id = p_relationship_id;

  insert into relationship_events (relationship_id, event_type, reason, source)
  values (p_relationship_id, 'unarchived', null, 'manual');
end;
$$;

grant execute on function unarchive_relationship(uuid) to anon;

-- 5. Same two commands, but for archiving/unarchiving many contacts at once
create or replace function archive_relationships_bulk(
  p_relationship_ids uuid[],
  p_reason text default 'Not specified'
)
returns void
language plpgsql
as $$
declare
  rid uuid;
begin
  foreach rid in array p_relationship_ids
  loop
    perform archive_relationship(rid, p_reason);
  end loop;
end;
$$;

grant execute on function archive_relationships_bulk(uuid[], text) to anon;

create or replace function unarchive_relationships_bulk(
  p_relationship_ids uuid[]
)
returns void
language plpgsql
as $$
declare
  rid uuid;
begin
  foreach rid in array p_relationship_ids
  loop
    perform unarchive_relationship(rid);
  end loop;
end;
$$;

grant execute on function unarchive_relationships_bulk(uuid[]) to anon;

-- Fix: work_items table was missing UPDATE permission, needed by
-- archive_relationship() to cancel pending to-dos when archiving.
-- Added 2026-07-12.
grant update on work_items to anon;
create policy "dev_anon_update_work_items" on work_items for update using (true);

-- ============================================================
-- SNOOZE RESURFACING FEATURE — added 2026-07-13
-- Adds 'resurfaced' event type. Actual resurfacing logic lives in the
-- daily-relationship-sweep Edge Function (application code, not schema).
-- ============================================================
alter type event_type add value if not exists 'resurfaced';

-- ============================================================
-- ADVISOR CHAT FEATURE — added 2026-07-13
-- New tables: advisor_conversations (threads), advisor_messages (turns).
-- v1 = exactly one thread per contact, enforced by
-- get_or_create_advisor_conversation(), not a DB constraint — so v2
-- (multiple named threads per contact) needs no schema changes.
-- Full migration: supabase/migrations/20260713173819_add_advisor_chat.sql
-- ============================================================



-- ============================================================
