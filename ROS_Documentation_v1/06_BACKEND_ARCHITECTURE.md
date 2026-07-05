# Backend Architecture

Domains

-   Contact
-   Relationship
-   Interaction
-   Work Item
-   Campaign
-   AI
-   Import
-   Search
-   Settings
-   Automation

Each domain owns: - routes - services - primitives - validators -
repositories

## Core Runtime Pipeline

Relationship Engine

↓

Work Item Engine

↓

AI Context Builder

↓

Communication Engine

↓

Delivery Adapter

↓

Interaction Event

↓

Relationship Memory Update

↓

Relationship Engine