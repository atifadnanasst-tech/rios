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
