# Parloir Cloud Implementation Plan

**Date:** 2026-04-18  
**Status:** Proposed  
**Depends on:** `docs/cloud/2026-04-18-parloir-cloud-architecture.md`

## Locked defaults

This plan assumes the following product decisions are already made:

- repo: separate private repo named `parloir-cloud`
- auth: **Clerk**
- provider model: **hosted-provider-only**
- pricing: **flat monthly plans with included credits and hard caps**
- tenancy boundary: **organization**
- deployment posture: **single-region managed SaaS**

## Delivery goal

Ship a first hosted release where a paying customer can:

1. sign up
2. create or join an organization
3. start a subscription
4. run hosted debate sessions
5. see usage against plan limits
6. invite teammates

## Suggested implementation phases

### Phase 0: repo bootstrap and contracts

**Goal:** create the `parloir-cloud` repo and lock the execution model before
writing tenant-specific product code.

Deliverables:
- new private `parloir-cloud` repo
- Next.js app scaffold
- package/tooling baseline
- environment variable contract
- deployment target chosen
- initial architecture README

Tasks:
- bootstrap Next.js app with TypeScript, pnpm, ESLint, and the same coding conventions as `parloir`
- create initial `.env.example`
- choose deployment platform
- add CI baseline: lint, typecheck, build
- add repo docs: README, SECURITY, deployment notes

Recommended env groups:
- app
- Clerk
- Stripe
- Postgres
- Redis
- Inngest
- provider credentials
- storage

Exit criteria:
- empty cloud app builds in CI
- secret contract is documented
- deployment target is chosen

### Phase 1: identity and tenancy foundation

**Goal:** establish organizations as the hard application boundary.

Deliverables:
- Clerk integration
- user onboarding
- organization creation
- organization switching
- basic membership model

Tasks:
- integrate Clerk auth in Next.js
- define app-side user profile sync strategy
- define `organizations` table
- define `organization_memberships` table
- implement organization creation on first signup
- implement personal organization bootstrap
- implement current-organization selection and persistence
- define three roles in app logic:
  - owner
  - admin
  - member

Key schema areas:
- `users`
- `organizations`
- `organization_memberships`

Locked implementation decisions:
- app DB is the source of truth for org authorization, billing joins, and usage
- Clerk provides identity/session primitives
- current organization must be resolvable in server-side request context and mirrored into app authorization checks
- new organizations receive a seeded read-only baseline persona catalog

Recommended direction:
- use Clerk for identity/session
- mirror org and membership state into app DB for application queries and billing joins

Exit criteria:
- user can sign in
- user gets a personal organization
- user can create or switch organizations
- every tenant-scoped API can resolve current organization safely

### Phase 1.5: auth and provider model transition

**Goal:** explicitly remove OSS assumptions that do not survive the cloud model.

This is a cross-cutting refactor phase, not a UI cleanup task.

Deliverables:
- Clerk-backed auth/session access layer
- removal or isolation of OSS BYOK/provider-settings assumptions
- hosted-credential-ready provider context path

Tasks:
- replace Better Auth middleware/session helpers with Clerk-backed equivalents
- remove dependency on OSS `user_credentials` and local provider settings flows
- redefine provider context loading around hosted provider credentials
- adapt provider resolution to a cloud-owned credential source
- review session creation and model-picker flows for BYOK assumptions
- review Inngest credential-loading step and replace user-key lookup logic

Areas expected to change relative to OSS:
- middleware and session helpers
- provider context loading
- provider registry entry points
- model picker assumptions
- `/api/providers/*` shape
- Inngest debate credential loading

Exit criteria:
- no launch-critical runtime path depends on OSS BYOK storage
- cloud auth/session model is coherent end-to-end

### Phase 2: billing skeleton and plan enforcement

**Goal:** make organizations billable before hosted inference is turned on.

Deliverables:
- Stripe customer linkage
- Stripe subscription linkage
- plan model
- entitlement checks

Tasks:
- create Stripe customer per organization
- define plans in Stripe
- add billing tables:
  - `subscriptions`
  - `entitlements`
  - `stripe_events`
  - `audit_logs`
- implement Checkout flow
- implement webhook handler
- derive active plan state from Stripe webhooks
- define account deletion/data-export policy now, even if some implementation lands later
- add app-side helpers:
  - `getOrganizationPlan`
  - `canStartSession`
  - `isPlanActive`

Recommended plan model for v1:
- `starter`
- `team`

Each plan should define:
- monthly credit allowance
- max seats
- allowed model families
- optional max active sessions / concurrency

Exit criteria:
- organization can subscribe
- webhook updates app state reliably
- app can block session start when plan is inactive
- subscription changes are audit-logged
- `stripe_events` deduplicates on unique `event_id`
- deletion/export policy is documented for downstream phases

### Phase 3: usage ledger and quota enforcement

**Goal:** meter usage internally even though pricing is flat-plan-first.

Deliverables:
- durable usage ledger
- monthly credit accounting
- hard-cap enforcement
- per-organization concurrency controls

Tasks:
- define `usage_ledgers` table
- define `billing_period_snapshots` table
- define monthly reset model
- add helper to reserve budget before session start
- add helper to consume usage during execution
- add helper to reconcile final usage after completion
- add Redis-backed per-organization active-session / execution semaphore
- expose usage totals in org settings/billing UI

Snapshot rollover can be implemented lazily on the first qualifying request
past a billing boundary in v1, unless the later usage-ledger design chooses a
dedicated scheduled job.

Each usage ledger row should capture:
- organization id
- session id
- turn id or event sequence when relevant
- event type
- provider
- model
- input/output tokens
- internal USD basis
- consumed credits
- timestamp

Quota enforcement points:
- before session creation if needed
- before session start
- before premium model selection
- during long-running execution if a hard ceiling is breached

Reservation specifics for long-running debates:
- reserve estimated worst-case budget before kickoff
- reconcile after each completed billable unit
- re-check remaining plan budget only at phase boundaries
- never abort an in-flight provider call
- if budget re-check fails, stop before the next phase with a quota-exhausted state
- do not begin synthesis without enough reserved budget to finish it

Recommended behavior on cap:
- block new sessions
- allow existing session to complete within reserved budget
- prompt upgrade rather than surprise overage in v1

Exit criteria:
- usage is written durably per run
- monthly usage can be displayed per organization
- plan limits are actually enforced

### Phase 4: hosted inference execution

**Goal:** run debates on platform-managed provider accounts.

Deliverables:
- hosted provider registry
- curated cloud model catalog config
- server-side model entitlement checks
- integration with debate execution path

Tasks:
- define cloud model catalog as versioned config for v1
- map plan tiers to allowed model families
- add provider credential management via deployment secrets
- adapt provider resolution to cloud-hosted credentials
- block disallowed models at API and workflow layers
- record provider/model usage into the usage ledger
- define idempotent session-start key strategy, preferably derived from stable
  org-scoped draft/session identifiers rather than arbitrary client strings

Recommended launch catalog:
- one fast model family for lightweight flows
- one standard model family for most debate panels
- one premium model family for deeper plans

Do not expose every upstream model in v1.

Exit criteria:
- hosted sessions run without customer API keys
- only plan-entitled models are selectable
- every run records authoritative usage

### Phase 5: cloud session product surface

**Goal:** adapt the app UX from self-host/BYOK assumptions to hosted SaaS assumptions.

Deliverables:
- cloud session creation flow
- plan-aware model picker
- usage UI
- billing/settings UI

Tasks:
- remove or replace OSS-specific BYOK settings flows
- build plan-aware model selection UI
- show current usage and remaining credits
- show billing status and upgrade prompts
- show plan gating for premium models/features
- ensure session pages are org-scoped everywhere

Key UX changes from OSS:
- no provider key entry in primary user path
- pricing/usage information must be visible
- org context must always be obvious

Exit criteria:
- customer can run the product without touching provider settings
- billing and quota status are visible in-product

### Phase 6: collaboration basics

**Goal:** make the hosted product meaningfully team-usable.

Deliverables:
- invitations
- membership management
- role-aware access control
- org session visibility
- account deletion and data-export implementation

Tasks:
- Clerk organization invitations
- member list UI
- role management UI
- org-scoped session listing
- ownership/admin checks on destructive actions
- emit audit events for role and membership changes

Access model for v1:
- owner/admin can manage members
- members can create and view org sessions
- owner handles billing

Exit criteria:
- owner can invite a teammate
- teammate can join and use the product within role policy
- deletion/export implementation matches the policy defined earlier

## Cross-cutting workstreams

### Shared rate limiting

Even with flat plans, cloud must not rely on in-memory rate limiting.

Implement:
- Redis-backed API rate limiting
- per-org limits
- per-user limits for auth-sensitive flows

### Per-org concurrency control

Rate limiting is not enough for hosted debate execution.

Implement:
- Redis-backed per-organization active-session semaphore or equivalent
- reservation of concurrency slots before debate kickoff
- release of slots on terminal completion/failure
- safe handling of resumed workflows so a noisy tenant cannot starve others

### Observability

Minimum:
- request id
- organization id on logs
- workflow run tracing
- billing webhook visibility
- usage reconciliation dashboards

### Security

Minimum:
- strict org scoping in all tenant queries
- verified Stripe webhook signatures
- verified Inngest webhook signatures
- admin-only billing and org management APIs
- no secret leakage in logs
- audit logging for membership and billing state changes

### Support tooling

At minimum, internal operator visibility into:
- organization subscription state
- current usage
- recent workflow failures
- recent billing webhook failures

### Deletion and export policy

This is cross-cutting and must be decided early, then implemented across phases.

Requirements:
- account/org deletion policy defined by Phase 2
- retention duration owner and sign-off assigned by Phase 2
- Stripe cancellation implications handled in billing flows
- Clerk identity cleanup behavior documented
- session/transcript disposition documented
- usage ledger and audit log retention honored even after customer-visible deletion

## Suggested initial schema modules

This is an app-layer grouping suggestion, not final SQL:

- `src/lib/db/schema/auth.ts`
- `src/lib/db/schema/organizations.ts`
- `src/lib/db/schema/billing.ts`
- `src/lib/db/schema/usage.ts`
- `src/lib/db/schema/sessions.ts`
- `src/lib/db/schema/personas.ts`

Key app-owned tables likely needed:
- `organizations`
- `organization_memberships`
- `subscriptions`
- `entitlements`
- `stripe_events`
- `usage_ledgers`
- `billing_period_snapshots`
- `audit_logs`

## Suggested execution order for the first engineering cycle

If you want a disciplined first build, do this:

1. Bootstrap `parloir-cloud` repo
2. Add Clerk auth
3. Add organizations + memberships
4. Do the auth/BYOK transition pass
5. Add Stripe customer/subscription wiring
6. Add plan state + entitlement checks
7. Add usage ledger
8. Add per-org concurrency controls
9. Add hosted model catalog config
10. Wire debate execution to hosted provider credentials
11. Build billing/usage UI
12. Add invites, audit logs, and basic team collaboration

That order is intentionally boring. It reduces rework.

## Risks to watch

### Risk: copying too much from OSS too early

Mitigation:
- only port what is needed
- keep cloud-specific code in cloud

### Risk: underbuilding metering because pricing is “flat”

Mitigation:
- meter internally from day one
- do not treat flat pricing as permission to skip usage accounting

### Risk: auth and org state split between Clerk and app DB becomes confusing

Mitigation:
- define one source of truth per concern
- document sync rules early

### Risk: model catalog explodes

Mitigation:
- curated catalog only at launch

## Open follow-up docs

After this plan, the next useful planning docs are:
- Clerk integration plan
- Stripe subscription + webhook plan
- usage ledger schema and credit accounting plan
- reservation estimator design
- provider partial-failure billing policy
- hosted model catalog design
- organization-scoped authorization plan
