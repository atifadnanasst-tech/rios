# RIOS — Context for Claude Code

You are working on RIOS (Relationship Intelligence Operating System), a long-lived
product, not a throwaway prototype. Read this file fully before making changes.

## Read these first, in order, before touching code

1. `ROS_Documentation_v1/00_PROJECT_VISION.md`
2. `ROS_Documentation_v1/01_CONSTITUTION.md`
3. `ROS_Documentation_v1/04_DATABASE_DOCTRINE.md`
4. `ROS_Documentation_v1/RIOS_Design_System_RIG_v0.1.md`
5. `ROS_Documentation_v1/rios_schema_v1.sql` (or wherever the current authoritative
   schema file lives — check `04_DATABASE_DOCTRINE.md` for the current path)

These documents are the product's constitution. They take precedence over your
own defaults and assumptions. If a request conflicts with them, say so before
implementing — don't silently follow the request over the doctrine.

## What RIOS actually is

Not a CRM. Relationships are the primary entity, not contacts or deals.
Relationships never terminate — reaching a goal advances them to a new
lifecycle stage and cadence, it doesn't close them out. AI drafts and
classifies; deterministic code owns business logic and scheduling. Humans
approve outbound communication. Full doctrine in `01_CONSTITUTION.md`.

## Current real architecture (as of this file's writing — verify against actual code, don't assume it hasn't changed)

- **Frontend:** Vite + React 19 + TypeScript. NOT Next.js, despite what
  `03_DEVELOPMENT_PROTOCOL.md` originally specified — this is a documented,
  deliberate deviation. Don't "fix" it back to Next.js.
- **State:** Zustand, single store at `src/store/useStore.ts`.
- **Database:** Supabase Postgres. Schema is authoritative in the repo's
  schema SQL file — treat it as source of truth for table/column names,
  not any prior conversation summary.
- **Data access pattern:** `src/lib/domain/` holds repository + mapper files
  (e.g. `relationships.ts`, `mappers.ts`, `search.ts`, `interactions.ts`,
  `bulkInteractions.ts`, `importInteractions.ts`). Components never query
  Supabase directly — they go through these. Keep this separation.
- **Auth model:** No user auth yet. Frontend uses the Supabase **publishable**
  key only, talking directly to Supabase (no Express/Node backend exists).
  RLS is enabled on every table with permissive `dev_anon_*` policies
  (search for that naming prefix in migration SQL) — this is intentional,
  temporary, single-user-only, and documented as needing real per-user RLS
  before any public deployment. Don't "harden" this unprompted; don't loosen
  it further either.
- **AI calls:** Only ever happen server-side, via a Supabase Edge Function
  (`supabase/functions/import-interactions/`). NEVER add an LLM API key to
  frontend code, no matter how small the feature or how "temporary." This
  project has a real prior incident of a key being exposed by accident —
  treat this as a hard rule, not a style preference.
- **The `supabase/functions/` folder runs on Deno**, a different runtime
  than the rest of the app. It's deliberately excluded from the root
  `tsconfig.json` (`"exclude": ["node_modules", "supabase"]`). Don't remove
  that exclude to "fix" Deno-related type errors — that's expected and correct.

## Engineering rules

- Every patch should be small, atomic, reversible, and explained before
  you make it: **WHY**, **WHAT**, **IMPACT**, **FILES MODIFIED**,
  **EXPECTED RESULT**. Then implement.
- Prefer incremental patches over redesigns. Never restructure folders,
  rename things broadly, or introduce new architectural layers (e.g. a new
  service/repository split) without flagging it as a bigger decision first
  — see "When to stop and ask" below.
- After any change, run `npx tsc --noEmit` yourself and confirm it's clean
  before telling the user you're done. Don't ask them to run it and report
  back for routine fixes — verify it yourself first.
- Don't guess at field names, types, or existing file contents. Read the
  actual current file before editing it.
- If static analysis (reading files, grep) doesn't conclusively reveal a
  bug's cause, prefer asking the user to test one specific thing in their
  already-running dev server (e.g. "click X, open devtools, tell me what
  console.log(document.activeElement) shows") over installing new tooling.
  Do NOT install Playwright, a browser, or other heavyweight test
  infrastructure to debug a single UI interaction bug — that's proportionate
  for building a real regression-test suite later, not for one-off diagnosis.
- Never start a new dev server if one might already be running (check
  `npm run dev` isn't already active before running it yourself, and prefer
  asking the user to check their existing terminal over starting a second
  instance on a different port).
- Git commits: small, descriptive messages. The project uses semantic
  version tags (`v1.0.0`, `v1.1.0`, etc.) at real milestones — suggest a
  tag bump when you ship something that feels like one, but don't tag
  automatically without being asked.
- Never commit `.env`. Never put a secret/service-role key or an LLM API
  key anywhere in `src/` or any file that ships to the browser.

## When to stop and ask instead of implementing

This project uses a two-lane process:
- **Tactical** (bug fixes, small UI adjustments, config fixes): just fix
  it, verify it compiles, explain what you changed and why.
- **Strategic** (schema changes, new tables, auth/security model changes,
  new architectural layers, anything affecting the Constitution or Database
  Doctrine documents): stop and describe the proposed change plainly instead
  of implementing it. The user runs bigger decisions like this through a
  separate review process before approving implementation.

If you're unsure which lane something falls into, treat it as strategic and
ask.

## Known intentional gaps (don't try to "complete" these unprompted)

- No real Targeting/Work Item Engine yet — work items are synthesized
  client-side from top relationships as a temporary stand-in
  (`fetchTodaysWorkItems` in `src/lib/domain/relationships.ts`). This is
  documented as temporary; a real engine is future work, not a bug.
- No history/timeline UI yet showing `relationship_events` per relationship
  — this is a known, acknowledged gap, next on the roadmap, not something
  to silently build as a side effect of an unrelated task.
- No light theme, no theme toggle — dark only, by design for now.
