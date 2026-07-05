# ROS Constitution

## Core Doctrines

1. Relationship First

Every architectural decision begins with the Relationship.

Contacts, channels, messages, campaigns and tasks are secondary objects that exist only to support a Relationship.

2.  Everything is an Event.
3.  Every actionable event becomes a Work Item.
4.  AI never owns business logic.
5.  Humans approve outbound communication.
6.  Expand, never contract.
7.  Append, never overwrite history.
8.  Channel adapters instead of channel-specific logic.
9.  JSONB before schema expansion where appropriate.
10. Every design decision must reduce cognitive load.

11. ROS thinks in Relationships, never Channels.

Channels are transport mechanisms.

Conversations build relationships.

Relationships create commercial outcomes.

12. Delivery mechanisms must remain completely independent from Relationship Logic.

Manual copy/paste and API integrations must produce identical payloads inside ROS.

13. Relationships never terminate.

A relationship does not "close" when its goal is achieved. Reaching a goal advances the relationship to a new lifecycle stage and a new operating mode — a different cadence, a different objective — not an exit from the system. Only explicit archiving by the owner or an opt-out by the contact ends active management of a relationship.

14. Goals and lifecycles are configurable per organisation, not hardcoded.

Every organisation defines its own default goal, default lifecycle target, and default cadence. Individual relationships may override these defaults. The engine that acts on goals and stages must remain identical regardless of which goal is configured.

## Future Expansion

(Add continuously.)

## Open Questions

(None yet.)

## Breaking Changes

(Keep empty whenever possible.)
