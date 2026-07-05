# Database Doctrine

## Philosophy

The database must always expand, never contract.

## Rules

-   Never drop tables.
-   Never rename tables without compatibility.
-   Prefer additive migrations.
-   Preserve historical events.
-   Store custom attributes in JSONB.
-   Every table includes:
    -   id
    -   organisation_id
    -   created_at
    -   updated_at

## Planned Core Tables

-   organisations
-   app_users
-   contacts (global identity, intentionally org-agnostic — see exception below)
-   relationships
-   relationship_memory
-   relationship_events (supersedes "interactions" — covers messages and non-message events alike)
-   targeting_rules
-   targeting_runs
-   work_items
-   campaigns
-   templates
-   ai_profiles
-   channel_accounts
-   attachments
-   audit_log

Schema v1.0 implementing the tables above lives in rios_schema_v1.sql. Treat that file as the authoritative, current source of truth for table shape; this document records the doctrine behind it, not a mirror of its columns.

## Exception: contacts omit organisation_id

Every table includes organisation_id except contacts. Contacts are a person's identity, which can be shared across multiple organisations the owner may run. Relationships, not contacts, are organisation-scoped. This is a deliberate, documented exception to the "every table has organisation_id" rule above.

## Score history rule

Scores and other frequently-recomputed fields keep exactly one current value on their table. Every change is recorded as a relationship_events row (event_type = 'score_updated', with old_value/new_value/reason), never as a parallel manual/computed/effective column pair. This preserves full history without column proliferation.

## Architectural Rule

The primary entity inside ROS is NOT Contact.

The primary entity is Relationship.

Contacts identify people.

Relationships represent business context.

Every Relationship owns:

- Commercial Objective
- Relationship Stage
- Relationship Memory
- Conversation History
- Work Items

Database design must always reflect this hierarchy.

For example: a contact's company and job title belong to the relationship, not the contact. The same person can hold different positions at different companies across different relationships over time; the contact record only identifies who they are.