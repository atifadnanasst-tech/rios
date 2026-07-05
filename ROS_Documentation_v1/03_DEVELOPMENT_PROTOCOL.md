# Development Protocol

## Technology Stack

Frontend - Next.js - React - TypeScript - Stitch for rapid UI generation

Backend - Node.js - Express - REST API

Database - Supabase PostgreSQL

Hosting - Hetzner VPS

Storage - Supabase Storage

## Engineering Rules

-   Business logic lives exclusively in Node.js.

Relationship logic is completely independent of delivery mechanisms.

Every communication must pass through the following layers:

Relationship Engine

↓

Work Item Engine

↓

AI Engine

↓

Communication Engine

↓

Delivery Adapter

No adapter may contain business rules.
-   AI never determines business rules.
-   One AI wrapper for all providers.
-   Event-driven architecture.
-   Domain-first folder structure.
-   Prefer composition over refactoring.
-   All major decisions documented before implementation.
