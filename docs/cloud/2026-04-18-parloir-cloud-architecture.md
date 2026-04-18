# Parloir Cloud Architecture

**Date:** 2026-04-18  
**Status:** Proposed  
**Scope:** future private repo, expected name `parloir-cloud`  
**Related repos:**
- `parloir` — public OSS, single-instance self-hostable edition
- `parloir-cloud` — future hosted SaaS product

## Goal

Define the first credible architecture for a paid hosted version of Parloir
without polluting the OSS repo with premature SaaS complexity.

The guiding constraint is explicit:

- `parloir` remains the public, single-instance self-hostable product
- `parloir-cloud` monetizes hosted infrastructure, operations, billing,
  collaboration, quota enforcement, and managed provider access

This document is a product and systems boundary proposal, not an
implementation task list.

## Product boundary

### `parloir` owns

- Core debate protocol and orchestrator
- Self-hostable web app
- Basic auth and account flows
- BYOK provider configuration
- Local/self-managed Postgres + Inngest deployment model
- Single-instance deployment posture
- Core correctness and security fixes

### `parloir-cloud` owns

- Multi-tenant SaaS architecture
- Subscription billing
- Organization and membership management
- Hosted provider credentials and usage controls
- Usage metering and quota enforcement
- Cloud admin/ops workflows
- Managed secrets, auditability, and support tooling
- Cloud-only collaboration and convenience features

### What should not happen

- Do not withhold basic safety or correctness fixes from OSS to create cloud differentiation.
- Do not push billing, RBAC, quota logic, or hosted-ops code into `parloir` unless it directly improves the self-host product too.
- Do not split shared packages early unless real duplication pressure appears.

## MVP outcome

The first paid cloud release should let a customer:

1. Create an account and organization
2. Start a subscription
3. Invite a small team
4. Create and run debate sessions from a hosted Parloir deployment
5. See usage and limits clearly
6. Rely on the service without managing providers, Postgres, or workers

If the MVP cannot do those six things reliably, it is not ready regardless of
feature count.

## Non-goals for cloud v1

- Multi-region active/active deployment
- Enterprise SSO / SCIM
- Customer-managed VPC deployment
- Fine-grained per-token pricing customization
- Full BYOK matrix across all providers
- Marketplace ecosystems, plugins, or third-party tenant extensions
- Per-tenant model routing customization beyond curated admin controls

## Guiding principles

1. **Tenancy is a security boundary.** Treat organization boundaries as hard isolation boundaries in code, data access, logs, and billing.
2. **Meter usage at the server, not the client.** Client hints are advisory only.
3. **Cloud should simplify operations.** If a feature makes hosted operations worse but only marginally helps parity, defer it.
4. **Prefer one region for v1.** Simpler correctness and billing beats premature global topology.
5. **Keep hosted provider access curated.** A small well-understood model catalog is easier to meter, support, and price.

## Recommended repo strategy

### Short term

Create `parloir-cloud` as a **separate private repo**.

Reasoning:
- OSS and cloud will diverge quickly on auth, billing, quotas, support tooling, and org management.
- Keeping the private SaaS work isolated avoids turning the OSS repo into a half-public monorepo with unclear boundaries.
- We accept explicit forking at the repo level for v1.

This is not "copy now, figure it out later." The explicit choice is:

- separate private repo
- no shared package extraction on day 0
- intentional sync from `parloir` into `parloir-cloud` on a documented cadence

Recommended sync cadence:
- review OSS changes before each cloud milestone
- fast-port any OSS correctness or security fixes that affect shared code paths
- do not auto-merge or pretend the repos are symmetrical

### Medium term

Do **not** extract shared packages immediately.

Wait until there is obvious, repeated duplication in at least one of these areas:
- debate protocol engine
- provider/model normalization logic
- shared domain types
- reusable UI primitives

When that pressure appears, extract the smallest useful shared package:

- `@parloir/core`
  - orchestrator types
  - protocol logic
  - consensus/synthesis helpers
  - provider-independent interfaces

Possible later packages:

- `@parloir/providers`
- `@parloir/ui`

Avoid extracting DB schema, billing models, or SaaS auth abstractions into a
shared package too early. Those are where cloud and OSS are most likely to
diverge.

## Explicit source-of-truth decisions

These are locked because they affect schema and API shape early:

### Organizations

`parloir-cloud` app database is the **source of truth** for organizations,
memberships, billing joins, entitlements, and usage.

Clerk is the source of truth for:
- identity
- authentication sessions
- invitation/session primitives we choose to rely on

Clerk organization state may be mirrored or used as a convenience layer, but
application authorization and billing logic should resolve against app-owned
organization records.

### Persona defaults

New organizations should start with a seeded **read-only baseline persona
catalog** derived from the OSS template set.

For v1:
- new orgs do not start empty
- baseline templates are immediately usable
- org-specific persona customization can layer on later
- public/shared persona publishing is deferred

## Tenancy model

### Proposed unit: organization

For cloud v1, the **organization** is the tenant and billing boundary.

Each organization owns:
- subscription
- seats or member roster
- usage ledger
- provider access policy
- sessions
- personas
- uploaded documents
- audit trail

Each user can belong to multiple organizations.

### Why organization as the primary boundary

- Billing maps cleanly to one paying customer
- RBAC stays understandable
- Session sharing is natural inside an org
- Usage and quotas are easier to reason about than per-user subscriptions

### What not to add yet

Do not introduce a separate “workspace” layer in v1 unless there is a real
need for multiple isolated spaces inside one organization. It adds complexity
to every query, permission check, and billing rule.

## Auth and identity

### Recommendation

Use **Clerk** for cloud v1.

For v1, the auth layer should support:
- email/password or magic link
- invitations
- membership acceptance
- session revocation
- MFA later

Why Clerk for v1:
- fastest path to a production-ready hosted auth layer
- built-in organization primitives
- invitation flows and membership management are already well supported
- lower implementation and operational risk than building auth deeply in-house

WorkOS remains a valid future migration or enterprise-oriented alternative if
SSO / SCIM pressure arrives early, but Clerk is the recommended launch choice.

### Suggested roles

- `owner`
  - billing
  - organization settings
  - member management
  - destructive actions
- `admin`
  - most operational settings
  - member management except ownership transfer
- `member`
  - create/run sessions
  - access org resources within policy

Avoid a large role matrix in v1. Three roles are enough.

## Billing model

### Recommendation

Use **Stripe** from the start.

For cloud v1, use **flat monthly plans with included credits and hard caps**:
- base subscription per organization
- included monthly credit allowance
- hard stop or upgrade prompt when the plan limit is reached

### Why this shape for launch

- customers get predictable monthly pricing
- the business keeps cost exposure bounded
- support and billing stay much simpler than true overage pricing
- the UI is easier to explain than raw token billing

This is intentionally different from a full hybrid overage model. Internally,
the system should still meter usage precisely so overages or add-on credits can
be introduced later without re-architecting the platform.

### Metered unit

Meter internally in:
- `cost_basis_microusd` as the authoritative financial basis
- `billable_millicredits` as the authoritative product-facing quota unit

Locked default:
- `1000 millicredits = 1 credit`
- `1 credit ~= $0.001` provider-cost basis at launch

This gives enough precision for small model calls without rounding most events
to zero, while keeping plan math understandable.

Customer-facing:
- included credits per month
- credits consumed this cycle
- remaining credits

Internal:
- authoritative token and provider usage ledger
- cost basis per request / turn / session

This lets pricing evolve without exposing raw token math everywhere in the UI.

## Provider strategy

### Recommendation for cloud v1

Start with **hosted-provider-only**, using provider credentials managed by
Parloir Cloud.

That means:
- Parloir Cloud owns the upstream provider accounts
- customers consume a curated hosted model catalog
- billing and quotas stay under one roof

### Why not BYOK first

BYOK sounds simpler, but for a paid hosted product it complicates:
- support
- error handling
- quotas
- entitlement logic
- enterprise expectations
- UX consistency

BYOK can exist later as a higher-tier or enterprise capability, but it should
not be part of the launch surface.

### Catalog shape

Cloud v1 should offer a curated set of supported model families, for example:
- a fast/cheap classifier tier
- a standard reasoning tier
- a premium deep-reasoning tier

Keep catalog size small and supportable. Do not surface every possible upstream
model ID in v1.

Clarification:
- plan-tier model family gating is part of v1
- per-tenant custom routing or custom model policies are not

## Usage metering

### Principles

- Record usage on the server only
- Use provider-returned authoritative usage when available
- Fall back to deterministic estimates only when necessary
- Write a durable ledger entry for every billable operation

### Billable events for v1

- session started
- tokens in / out per agent turn
- judge and synthesizer usage
- tool usage that has direct cost
- document storage / embeddings later if enabled

### Recommended ledger model

Tables or equivalent records:
- `organizations`
- `organization_memberships`
- `subscriptions`
- `usage_ledgers`
- `billing_period_snapshots`
- `entitlements`

Each usage ledger row should include:
- organization id
- session id if relevant
- turn id or session event sequence when relevant
- event type
- provider
- model
- input tokens
- output tokens
- internal cost basis
- billable credits
- timestamp

### Retention policy

Usage ledgers are financial and quota-enforcement records.

Locked v1 policy:
- usage ledger rows are retained after organization deletion requests
- customer-visible org data may be deleted or tombstoned per deletion policy,
  but billing/usage records required for financial reconciliation are retained
- the exact retention duration should be documented before launch and matched
  to accounting and support obligations

### Quota enforcement

Quota checks should happen before expensive work begins:
- organization is active
- subscription is valid
- usage ceiling not exceeded
- model is allowed by plan

For long-running sessions, use **budget reservation plus phase-boundary budget
re-checks**.

Locked v1 behavior:
- reserve an estimated budget before kickoff based on:
  - selected panel size
  - selected depth
  - chosen model family
  - worst-case turn budget heuristics
- write that reservation durably
- reconcile actual usage after each billable unit
- re-check remaining plan budget only at safe checkpoints:
  - before a new round
  - before judge
  - before synthesis
- never abort an in-flight model call mid-request
- if a required budget re-check fails, stop before the next phase and return a
  clear quota-exhausted terminal state

The reservation estimator itself should be specified in a dedicated follow-up
design doc. It should not be invented ad hoc during implementation.

For billing fairness:
- provider 5xx / transport failures that produce no usable model output should
  not consume customer credits
- successfully completed model responses that already incurred real usage do
  consume credits
- failed sessions should still retain ledger truth for internal cost analysis

The exact partial-failure billing rules require a dedicated design pass because
providers may still bill input tokens or partial output on failed requests.

## Data and storage

### Recommended managed services for v1

- Postgres
  - primary app data
  - sessions
  - memberships
  - usage ledger
  - billing metadata
- Redis
  - shared rate limiting
  - short-lived quota locks
  - idempotency helpers
- Inngest Cloud
  - durable workflow orchestration

Object storage is not required for cloud v1 unless document upload or export
features are brought into scope.

### Isolation rules

Every tenant-scoped table should carry an organization id unless it is
truly global.

Never rely on UI filtering for tenant isolation. Queries should always scope by
organization id in the database access layer.

## Secrets and key management

### Hosted provider secrets

Store platform provider credentials outside the main application config where
possible, using the deployment platform's managed secrets store.

### Customer secrets

If BYOK is added later:
- encrypt customer provider keys at rest
- scope them to the organization
- support rotation
- never log them
- expose only masked metadata in the UI

### App-level secrets

Required cloud secrets likely include:
- auth secret
- billing webhook secret
- Inngest signing key
- encryption key
- provider API keys

These should be centrally managed and rotated with documented runbooks.

## Runtime architecture

### Recommended v1 topology

1. **Next.js app**
   - UI
   - auth callbacks
   - org/session APIs
   - settings/billing pages

2. **Inngest Cloud + webhook endpoint**
   - debate workflow execution
   - retries
   - concurrency control

3. **Managed Postgres**
   - transactional source of truth

4. **Managed Redis**
   - shared rate limiting
   - quota reservation
   - short-lived coordination

### Single-region recommendation

Start in one region, colocating:
- app
- database
- Redis

This reduces:
- latency variance
- consistency complexity
- billing reconciliation errors
- operational burden

## Reliability requirements

Cloud v1 should explicitly handle:
- idempotent session start requests
- retried webhook deliveries
- quota checks under concurrency
- session ownership and org membership checks
- graceful provider failure reporting
- backpressure when usage ceilings are hit

Per-org concurrency is a first-class control.

Locked direction:
- keep per-session execution deduplication at the session level
- enforce per-organization active-session or budget concurrency via Redis-backed
  reservation/semaphore checks before kickoff and at resume points
- do not rely on raw Inngest sessionId concurrency alone for tenant fairness

### Observability

Minimum cloud observability:
- request logs with org and request ids
- workflow run logs
- usage ledger reconciliation dashboards
- billing webhook monitoring
- alerts for provider failures and quota enforcement failures

## Security requirements beyond OSS

`parloir-cloud` should add controls that the OSS repo intentionally does not:

- shared-store rate limiting
- tenant-aware audit logs from launch for:
  - subscription state changes
  - role changes
  - membership invites/acceptance
- stricter admin authorization checks
- billing abuse controls
- managed provider spend ceilings
- webhook signature validation everywhere it matters
- privileged operator tooling separated from customer APIs

## Recommended execution order

Use the dedicated implementation plan in
`docs/cloud/2026-04-18-parloir-cloud-implementation-plan.md` as the
authoritative phase breakdown. It supersedes any earlier high-level ordering.

## Migration stance

Cloud v1 should assume **fresh cloud accounts only**.

There is no automated OSS-to-cloud migration path in the first release. If
import from self-hosted Parloir becomes important later, design it as an
explicit import/export feature rather than an implicit compatibility promise.

## Open decisions

These do not block the architecture direction, but they do need answers before
implementation starts:

1. Do you want personal accounts as one-user organizations automatically?
2. Which hosted model catalog is acceptable for launch?

## Recommended answer set for v1

If you want the least risky path, the default answers should be:

1. Yes, personal account = personal organization
2. Small curated hosted catalog

## Next planning docs

Required follow-up design docs before deeper implementation:
- reservation estimator design
- provider partial-failure billing policy
- Clerk integration plan
- Stripe subscription + webhook plan
