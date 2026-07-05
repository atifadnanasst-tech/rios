# Channel Adapters

Every communication channel implements the same interface.

Current adapters

-   Email
-   LinkedIn
-   WhatsApp
-   Phone

Future

-   Telegram
-   Slack
-   Microsoft Teams
-   SMS

Adapters only deliver. They never contain business logic.

## Adapter Doctrine

Every adapter receives exactly the same payload.

Manual workflow

Generate

↓

Copy

↓

Paste

↓

Interaction Event

Automatic workflow

Generate

↓

API

↓

Interaction Event

Everything after Interaction Event must be identical.

Adapters are replaceable components.

The Relationship Engine must never know whether communication was manual or automatic.