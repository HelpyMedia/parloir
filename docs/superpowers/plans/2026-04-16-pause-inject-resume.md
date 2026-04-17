# Pause / Inject / Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the UI's Pause, Interject, and Resume buttons to a real backend. A running debate can be paused between phases, one or more human notes can be queued, and the orchestrator resumes from the paused phase with the notes inserted as human turns visible to all subsequent speakers.

**Architecture:** Introduce a `ControlPlane` interface alongside `Storage` and `StreamSink` in the orchestrator. Between every phase boundary, `runDebate` calls `drainInjectionsAndWait(...)` which (a) appends queued human turns and (b) blocks via `step.waitForEvent("debate.resumed")` if pause was requested. Pause state lives on the `sessions` row (`paused_requested_at`, `paused_at_phase`). Queued notes live in a new `pending_injections` table. Because Inngest durably persists `waitForEvent`, "resume from last completed phase" is free — no re-invocation of `runDebate`.

**Tech Stack:** Next.js App Router (Node runtime), Drizzle ORM + Postgres, Inngest `step.waitForEvent`, Vercel AI SDK, React reducer.

**Scope boundaries:**
- **In scope:** Backend gaps #1 (Pause/Resume), #2 (Interjection), and #4 (Checkpoint resume — via Inngest step-level durability).
- **Out of scope, split to future plans:**
  - #3 Ask-another-round / Ask-persona — needs a protocol design call first (is it a new phase or a re-entry into critique?). Separate plan.
  - #5 Cost extraction — standalone. Separate plan.
  - #6 Auth scoping, #7 DB personas, #8 Title edit — blocked on the auth / persona-DB workstreams.

**Assumptions about existing code (verified):**
- `runDebate(session, participants, storage, sink)` already exists in `src/lib/orchestrator/protocol.ts:220`.
- Inngest workflow at `src/lib/inngest/debate-workflow.ts:30` calls `runDebate` inside a single `step.run("run-debate", ...)` with concurrency `{ key: "event.data.sessionId", limit: 1 }`.
- `SessionShell` at `src/components/session/layout/SessionShell.tsx:18` already renders `PausedOverlay` when local `paused` state or `state.humanInjectionPrompt` is truthy — today that's purely UI-local.
- `StreamEvent` union already includes `{ type: "human_injection_request"; prompt: string }` (declared but never emitted).
- `sessions.status` already has `"paused"` in the phase enum.
- There is no test runner. Gates are `pnpm typecheck` and `pnpm lint` plus manual verification via the local Next + Inngest dev stack.

**Manual verification setup** (referenced from several steps):
- Terminal A: `pnpm inngest:dev`
- Terminal B: `pnpm dev`
- Need at least 2 template personas configured; seed script: `pnpm tsx scripts/seed-dev.ts` (present in repo — verify with `ls scripts/`).

---

## File Structure

**Create:**
- `db/migrations/<next_id>_pause_inject_resume.sql` — Drizzle-generated.
- `src/lib/orchestrator/control.ts` — `ControlPlane` interface + `NoopControlPlane` for tests/local scripts.
- `src/lib/inngest/control-plane.ts` — Inngest-backed implementation; closes over a per-invocation `step`.
- `src/app/api/sessions/[id]/pause/route.ts` — POST.
- `src/app/api/sessions/[id]/resume/route.ts` — POST.
- `src/app/api/sessions/[id]/inject/route.ts` — POST.

**Modify:**
- `src/lib/db/schema.ts` — add `pauseRequestedAt`, `pausedAtPhase` columns to `sessions`; add `pendingInjections` table.
- `src/lib/db/client.ts` — extend storage adapter with `appendInjectionTurn` (reuses `appendTurn`) and persist new session columns in `updateSession`.
- `src/lib/orchestrator/types.ts` — extend `Session` with `pausedAtPhase` + `pauseRequestedAt`; add `HumanInjection` type; add `human_turn_appended` stream event variant (optional — spec allows reusing `turn_complete`).
- `src/lib/orchestrator/protocol.ts` — thread `ControlPlane` through `runDebate`; add `drainInjectionsAndWait` helper; insert calls between phases.
- `src/lib/inngest/debate-workflow.ts` — construct the Inngest control plane with current `step`; pass to `runDebate`; handle `debate.resumed` event via `step.waitForEvent`.
- `src/components/session/layout/SessionShell.tsx` — wire Pause / Resume / Interject handlers to the new APIs.
- `src/components/session/paused/PausedOverlay.tsx` — hand `onSubmit` the raw content (already the case) so the shell can POST it.
- `src/lib/session-ui/reducer.ts` — handle `phase === "paused"` entry + exit; keep `humanInjectionPrompt` lifecycle.

---

## Task 1: DB schema — pause state and pending_injections

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `db/migrations/<next_id>_pause_inject_resume.sql` (via `pnpm db:generate`)

- [ ] **Step 1: Add columns and new table to the Drizzle schema**

Edit `src/lib/db/schema.ts` to:

(a) Extend `sessions` (currently at `src/lib/db/schema.ts:108`). Inside the column definitions, **after** `completedAt`, add:

```ts
pauseRequestedAt: timestamp("pause_requested_at", { withTimezone: true }),
pausedAtPhase: phaseEnum("paused_at_phase"),
```

Do not change indexes.

(b) **After** the `sessionEvents` table declaration (ends near `src/lib/db/schema.ts:257`), add:

```ts
// ─── Pending human injections (queued during pause) ─────────────────────────
// Injections are inserted by /api/sessions/[id]/inject. The orchestrator
// drains them at every phase boundary, appending each as a human Turn. The
// `deliveredAt` column is how we mark a row as consumed — we do not delete,
// so we keep an audit trail of every interjection attempt.
export const pendingInjections = pgTable(
  "pending_injections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdByName: text("created_by_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deliveredTurnId: uuid("delivered_turn_id").references(() => turns.id, {
      onDelete: "set null",
    }),
  },
  (t) => ({
    sessionPendingIdx: index("pending_injections_session_idx").on(
      t.sessionId,
      t.deliveredAt,
    ),
  }),
);
```

- [ ] **Step 2: Generate the migration**

Run:
```bash
pnpm db:generate
```

Expected: a new file under `db/migrations/` (name chosen by drizzle-kit, e.g. `0001_<adjective>_<noun>.sql`) containing:
- `ALTER TABLE "sessions" ADD COLUMN "pause_requested_at" timestamp with time zone;`
- `ALTER TABLE "sessions" ADD COLUMN "paused_at_phase" "phase";`
- `CREATE TABLE IF NOT EXISTS "pending_injections" (...)`
- Two foreign-key constraints to `sessions` and `users` and one to `turns`.
- `CREATE INDEX "pending_injections_session_idx" ON "pending_injections" ...`

Open the generated file. If the order does anything surprising (e.g. creates the table before the FK target), don't edit — drizzle-kit's output is authoritative; note the filename for the next step.

- [ ] **Step 3: Apply the migration locally**

Run:
```bash
pnpm db:migrate
```

Expected: migration log line per statement, exit code 0. If it errors on the `turns` FK (because the turns table is referenced before certain columns exist in some dev databases), re-check the migration order — but on a DB already running `0000_groovy_gressill.sql` this will succeed.

- [ ] **Step 4: Typecheck**

Run:
```bash
pnpm typecheck
```

Expected: 0 errors. The new columns and table are strictly additive; nothing else should break yet.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts db/migrations
git commit -m "feat(db): add pause state columns and pending_injections table"
```

---

## Task 2: Extend Session type with pause fields

**Files:**
- Modify: `src/lib/orchestrator/types.ts`

- [ ] **Step 1: Add pause fields to `Session`**

In `src/lib/orchestrator/types.ts`, modify the `Session` interface (at `src/lib/orchestrator/types.ts:113`). Add **after** `completedAt: Date | null;`:

```ts
  /** Set by POST /pause. Cleared by POST /resume. */
  pauseRequestedAt: Date | null;
  /** The phase the session was in when pause was requested — resume target. */
  pausedAtPhase: Phase | null;
```

- [ ] **Step 2: Add `HumanInjection` type**

In the same file, **after** the `ToolCall` interface (near `src/lib/orchestrator/types.ts:54`), add:

```ts
/** A queued human note waiting to be appended at the next phase boundary. */
export interface HumanInjection {
  id: string;
  sessionId: string;
  content: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
}
```

- [ ] **Step 3: Typecheck**

Run:
```bash
pnpm typecheck
```

Expected: errors in `src/lib/db/client.ts`, `src/lib/inngest/debate-workflow.ts`, and `src/app/sessions/[id]/page.tsx` / `src/app/api/sessions/[id]/route.ts` where `Session` is constructed — the added fields are required. Fix each by passing the two new fields from the row:

In `src/lib/db/client.ts` — currently `updateSession` does not need changes, but search for places where a `Session` is constructed (none in client.ts itself). Leave it.

In `src/app/sessions/[id]/page.tsx` (the `return { session: {...} }` near `src/app/sessions/[id]/page.tsx:115`):

```ts
  const session: Session = {
    id: sessionRow.id,
    title: sessionRow.title,
    question: sessionRow.question,
    context: sessionRow.context,
    status: sessionRow.status,
    currentRound: sessionRow.currentRound,
    protocol: sessionRow.protocol,
    createdBy: sessionRow.createdBy,
    createdAt: sessionRow.createdAt,
    updatedAt: sessionRow.updatedAt,
    completedAt: sessionRow.completedAt,
    pauseRequestedAt: sessionRow.pauseRequestedAt ?? null,
    pausedAtPhase: sessionRow.pausedAtPhase ?? null,
  };
```

Apply the same two trailing fields at `src/app/api/sessions/[id]/route.ts:136`.

In `src/lib/inngest/debate-workflow.ts:60` where `const session: Session = { ...loaded.sessionRow, ... }` spreads the row — no change needed because the cast already covers new columns; however TypeScript may still complain about the `as unknown as Session` cast. If it does, add to the explicit object:

```ts
    const session: Session = {
      ...loaded.sessionRow,
      createdAt: new Date(loaded.sessionRow.createdAt),
      updatedAt: new Date(loaded.sessionRow.updatedAt),
      completedAt: loaded.sessionRow.completedAt
        ? new Date(loaded.sessionRow.completedAt)
        : null,
      pauseRequestedAt: loaded.sessionRow.pauseRequestedAt
        ? new Date(loaded.sessionRow.pauseRequestedAt)
        : null,
      pausedAtPhase: loaded.sessionRow.pausedAtPhase ?? null,
    } as unknown as Session;
```

- [ ] **Step 4: Re-run typecheck, confirm clean**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orchestrator/types.ts src/app/sessions src/app/api/sessions src/lib/inngest
git commit -m "feat(types): add pause state + HumanInjection to core types"
```

---

## Task 3: Define `ControlPlane` interface + Noop impl

**Files:**
- Create: `src/lib/orchestrator/control.ts`

- [ ] **Step 1: Create the file**

Write `src/lib/orchestrator/control.ts`:

```ts
/**
 * ControlPlane — the human-in-the-loop interface the orchestrator depends on.
 *
 * The orchestrator calls into this at every phase boundary:
 *   1. drainInjections(sessionId) — returns any queued human notes.
 *   2. waitIfPauseRequested(sessionId) — blocks until resumed, durably.
 *
 * Two implementations:
 *   - InngestControlPlane: uses step.waitForEvent("debate.resumed"); durable
 *     across restarts. Lives in src/lib/inngest/control-plane.ts.
 *   - NoopControlPlane: for unit tests and scripts that run runDebate inline.
 *     waitIfPauseRequested is a no-op; drainInjections returns []. Pause has
 *     no effect in this mode.
 */

import type { HumanInjection, Phase } from "./types";

export interface ControlPlane {
  /** Drain queued human notes, marking them delivered. Safe to call often. */
  drainInjections(sessionId: string): Promise<HumanInjection[]>;

  /**
   * If the session has a pending pause request, block until a matching
   * "debate.resumed" signal arrives or the timeout expires, then clear the
   * pause flag. Returns true if the call actually paused, false otherwise.
   */
  waitIfPauseRequested(sessionId: string): Promise<boolean>;

  /**
   * Best-effort snapshot of the pause flag for the given session. Used by the
   * orchestrator to emit `human_injection_request` before calling
   * waitIfPauseRequested so the UI can render the overlay immediately.
   */
  isPauseRequested(sessionId: string): Promise<boolean>;

  /** Record which phase we're pausing in, so resume can restore it. */
  markPausedAtPhase(sessionId: string, phase: Phase): Promise<void>;
}

export class NoopControlPlane implements ControlPlane {
  async drainInjections(): Promise<HumanInjection[]> {
    return [];
  }
  async waitIfPauseRequested(): Promise<boolean> {
    return false;
  }
  async isPauseRequested(): Promise<boolean> {
    return false;
  }
  async markPausedAtPhase(): Promise<void> {
    /* no-op */
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/orchestrator/control.ts
git commit -m "feat(orchestrator): add ControlPlane interface + NoopControlPlane"
```

---

## Task 4: Wire `drainInjectionsAndWait` into `runDebate`

**Files:**
- Modify: `src/lib/orchestrator/protocol.ts`

- [ ] **Step 1: Extend `runDebate` signature and imports**

In `src/lib/orchestrator/protocol.ts`, near the top where types are imported (`src/lib/orchestrator/protocol.ts:25`), add:

```ts
import type { ControlPlane } from "./control";
```

Change `runDebate` (at `src/lib/orchestrator/protocol.ts:220`) signature from:

```ts
export async function runDebate(
  session: Session,
  participants: Participant[],
  storage: Storage,
  sink: StreamSink,
) {
```

to:

```ts
export async function runDebate(
  session: Session,
  participants: Participant[],
  storage: Storage,
  sink: StreamSink,
  controlPlane: ControlPlane,
) {
```

- [ ] **Step 2: Add the helper function at the bottom of the file**

Add **after** `extractReferences` (at the end of `src/lib/orchestrator/protocol.ts`):

```ts
// ─── Phase-boundary control point ───────────────────────────────────────────
/**
 * Called between every phase. Appends any queued human injections as human
 * Turns visible to subsequent speakers, then blocks if pause was requested.
 * After a wait, re-drains — a user can submit a note *during* the pause and
 * we want it visible in the very next phase.
 */
async function drainInjectionsAndWait(
  session: Session,
  atPhase: Phase,
  storage: Storage,
  sink: StreamSink,
  controlPlane: ControlPlane,
): Promise<void> {
  await drainOnce(session, atPhase, storage, sink, controlPlane);

  if (await controlPlane.isPauseRequested(session.id)) {
    await controlPlane.markPausedAtPhase(session.id, atPhase);
    await storage.updateSession(session.id, { status: "paused" });
    await sink.emit({
      type: "human_injection_request",
      prompt:
        "Deliberation paused. Add a note to steer the next phase, or resume without interjecting.",
    });

    const paused = await controlPlane.waitIfPauseRequested(session.id);
    if (paused) {
      // Restore the phase we were in so the transcript / UI shows us back on
      // track before the next phase_enter fires.
      await storage.updateSession(session.id, { status: atPhase });
      await drainOnce(session, atPhase, storage, sink, controlPlane);
    }
  }
}

async function drainOnce(
  session: Session,
  atPhase: Phase,
  storage: Storage,
  sink: StreamSink,
  controlPlane: ControlPlane,
): Promise<void> {
  const injections = await controlPlane.drainInjections(session.id);
  if (injections.length === 0) return;

  const transcript = await storage.getTranscript(session.id);
  let turnIndex = transcript.filter(
    (t) => t.phase === atPhase && t.roundNumber === session.currentRound,
  ).length;

  for (const injection of injections) {
    await sink.emit({
      type: "turn_start",
      speakerId: injection.createdBy,
      speakerName: injection.createdByName,
      phase: atPhase,
    });

    const turn: Turn = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      phase: atPhase,
      roundNumber: session.currentRound,
      turnIndex: turnIndex++,
      speakerRole: "human",
      speakerId: injection.createdBy,
      speakerName: injection.createdByName,
      content: injection.content,
      references: [],
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      model: "",
      createdAt: new Date(),
    };

    await storage.appendTurn(turn);
    await sink.emit({ type: "turn_complete", turn });
  }
}
```

- [ ] **Step 3: Insert calls at phase boundaries inside `runDebate`**

Edit the `runDebate` body. The full new body replaces the existing loop at `src/lib/orchestrator/protocol.ts:226-277`:

```ts
  try {
    // Phase 1: parallel blind opening. We DO NOT drain injections before
    // opening — agents must start blind. We drain after, before critique.
    await storage.updateSession(session.id, { status: "opening", currentRound: 0 });
    await runOpeningPhase(session, participants, storage, sink);

    await drainInjectionsAndWait(session, "opening", storage, sink, controlPlane);

    // Phase 2..N: critique rounds with consensus checks
    let consensusReached = false;
    for (
      let round = 1;
      round <= session.protocol.maxCritiqueRounds && !consensusReached;
      round++
    ) {
      await storage.updateSession(session.id, { status: "critique", currentRound: round });
      // Refresh in-memory currentRound so drain places human turns in this round.
      session.currentRound = round;
      await runCritiqueRound(session, participants, round, storage, sink);

      await drainInjectionsAndWait(session, "critique", storage, sink, controlPlane);

      const report = await runConsensusCheck(session, participants, storage, sink);

      if (report.consensusLevel >= session.protocol.consensusThreshold) {
        consensusReached = true;
      } else if (
        report.recommendation === "another_round" &&
        session.protocol.enableAdaptiveRound &&
        round === session.protocol.maxCritiqueRounds
      ) {
        await storage.updateSession(session.id, {
          status: "adaptive_round",
          currentRound: round + 1,
        });
        session.currentRound = round + 1;
        await drainInjectionsAndWait(
          session,
          "adaptive_round",
          storage,
          sink,
          controlPlane,
        );
        await runAdaptiveRound(session, participants, report, storage, sink);
        break;
      }
    }

    // Phase 5: synthesis
    await drainInjectionsAndWait(session, "synthesis", storage, sink, controlPlane);
    await storage.updateSession(session.id, { status: "synthesis" });
    await runSynthesis(session, storage, sink);

    await storage.updateSession(session.id, {
      status: "completed",
      completedAt: new Date(),
    });
  } catch (err) {
    await storage.updateSession(session.id, { status: "failed" });
    await sink.emit({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
      recoverable: false,
    });
    throw err;
  }
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: error in `src/lib/inngest/debate-workflow.ts` — `runDebate` is called with 4 args but now requires 5. That is fixed in Task 5. Temporarily **add a stub** to make typecheck pass if needed by importing and passing `new NoopControlPlane()`:

In `src/lib/inngest/debate-workflow.ts`, change the `runDebate` call (at `src/lib/inngest/debate-workflow.ts:80`) to:

```ts
      await runDebate(session, participants, storage, {
        async emit(evt: StreamEvent) {
          await appendStreamEvent(sessionId, evt);
        },
      }, new (await import("@/lib/orchestrator/control")).NoopControlPlane());
```

(This is intentionally ugly — it is a temporary shim and Task 5 replaces it with the real implementation.)

- [ ] **Step 5: Re-run typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Lint**

```bash
pnpm lint
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/orchestrator/protocol.ts src/lib/inngest/debate-workflow.ts
git commit -m "feat(orchestrator): drainInjectionsAndWait between phases"
```

---

## Task 5: Inngest-backed ControlPlane

**Files:**
- Create: `src/lib/inngest/control-plane.ts`
- Modify: `src/lib/inngest/debate-workflow.ts`
- Modify: `src/lib/db/client.ts`

- [ ] **Step 1: Extend storage with injection-draining primitive**

The ControlPlane needs a DB helper for transactional drain. Add it to `src/lib/db/client.ts` as an exported function (not on the Storage interface — this is Inngest-side only).

Add near the top of `src/lib/db/client.ts`, after the existing imports:

```ts
import { isNull } from "drizzle-orm";
import type { HumanInjection, Phase } from "@/lib/orchestrator/types";
```

Add **after** the `storage` export:

```ts
// ─── Pause / inject helpers (not on the orchestrator Storage interface — ────
// these are control-plane concerns kept adjacent for easy review).
export async function drainPendingInjections(
  sessionId: string,
): Promise<HumanInjection[]> {
  return await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(schema.pendingInjections)
      .where(
        and(
          eq(schema.pendingInjections.sessionId, sessionId),
          isNull(schema.pendingInjections.deliveredAt),
        ),
      )
      .orderBy(asc(schema.pendingInjections.createdAt))
      .for("update");

    if (rows.length === 0) return [];

    await tx
      .update(schema.pendingInjections)
      .set({ deliveredAt: new Date() })
      .where(
        inArray(
          schema.pendingInjections.id,
          rows.map((r) => r.id),
        ),
      );

    return rows.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      content: r.content,
      createdBy: r.createdBy,
      createdByName: r.createdByName,
      createdAt: r.createdAt,
    }));
  });
}

export async function isSessionPauseRequested(
  sessionId: string,
): Promise<boolean> {
  const row = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
    columns: { pauseRequestedAt: true },
  });
  return row?.pauseRequestedAt != null;
}

export async function markSessionPausedAtPhase(
  sessionId: string,
  phase: Phase,
): Promise<void> {
  await db
    .update(schema.sessions)
    .set({ pausedAtPhase: phase, updatedAt: new Date() })
    .where(eq(schema.sessions.id, sessionId));
}

export async function clearSessionPause(sessionId: string): Promise<void> {
  await db
    .update(schema.sessions)
    .set({
      pauseRequestedAt: null,
      pausedAtPhase: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.sessions.id, sessionId));
}
```

- [ ] **Step 2: Create the Inngest control plane file**

Write `src/lib/inngest/control-plane.ts`:

```ts
/**
 * Inngest-backed ControlPlane.
 *
 * Built per-invocation because step.waitForEvent must be called with the
 * current workflow's `step` instance. The factory below closes over `step`
 * and the `sessionId` we are running for.
 *
 * Durability: step.waitForEvent is Inngest's native "suspend until signal"
 * primitive — the function state is persisted, the in-process runtime frees
 * its resources, and resumption happens when a matching event arrives.
 */

import type { GetFunctionInput } from "inngest";
import type { inngest } from "./client";
import type { ControlPlane } from "@/lib/orchestrator/control";
import type { HumanInjection, Phase } from "@/lib/orchestrator/types";
import {
  drainPendingInjections,
  isSessionPauseRequested,
  markSessionPausedAtPhase,
  clearSessionPause,
} from "@/lib/db/client";

type WorkflowStep = GetFunctionInput<typeof inngest>["step"];

const RESUME_TIMEOUT = "7d"; // generous — Inngest stores state for us.

export function createInngestControlPlane(
  step: WorkflowStep,
  sessionId: string,
): ControlPlane {
  return {
    async drainInjections(sid: string): Promise<HumanInjection[]> {
      if (sid !== sessionId) throw new Error("ControlPlane/session mismatch");
      // Not wrapped in step.run: drain is already idempotent-by-marking-delivered,
      // and we want it to happen on *every* orchestrator pass (including after
      // re-entry from waitForEvent) rather than being memoized by Inngest.
      return drainPendingInjections(sid);
    },

    async isPauseRequested(sid: string): Promise<boolean> {
      if (sid !== sessionId) throw new Error("ControlPlane/session mismatch");
      return isSessionPauseRequested(sid);
    },

    async markPausedAtPhase(sid: string, phase: Phase): Promise<void> {
      if (sid !== sessionId) throw new Error("ControlPlane/session mismatch");
      await markSessionPausedAtPhase(sid, phase);
    },

    async waitIfPauseRequested(sid: string): Promise<boolean> {
      if (sid !== sessionId) throw new Error("ControlPlane/session mismatch");
      if (!(await isSessionPauseRequested(sid))) return false;

      // Suspend until POST /resume sends { name: "debate.resumed", data: { sessionId } }.
      await step.waitForEvent(`await-resume:${sid}`, {
        event: "debate.resumed",
        match: "data.sessionId",
        timeout: RESUME_TIMEOUT,
      });

      await clearSessionPause(sid);
      return true;
    },
  };
}
```

- [ ] **Step 3: Wire the real control plane into the workflow**

Edit `src/lib/inngest/debate-workflow.ts`. Replace the imports block at the top to include the new factory:

```ts
import { inngest } from "./client";
import { runDebate } from "@/lib/orchestrator/protocol";
import { storage, db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import type { Session, Participant, StreamEvent } from "@/lib/orchestrator/types";
import { createInngestControlPlane } from "./control-plane";
```

Replace the `step.run("run-debate", ...)` block (at `src/lib/inngest/debate-workflow.ts:79`) with:

```ts
    const controlPlane = createInngestControlPlane(step, sessionId);

    await step.run("run-debate", async () => {
      await runDebate(
        session,
        participants,
        storage,
        {
          async emit(evt: StreamEvent) {
            await appendStreamEvent(sessionId, evt);
          },
        },
        controlPlane,
      );
    });
```

**Important note:** `step.waitForEvent` cannot be nested inside `step.run`. Inngest only honors step.* calls at the top level of the function body. So we must pull the debate loop out of `step.run` and call it directly inside the outer `async ({ event, step })` — otherwise `waitIfPauseRequested` will throw.

Change the line `await step.run("run-debate", async () => {` to a direct call with no `step.run` wrapper:

```ts
    const controlPlane = createInngestControlPlane(step, sessionId);

    await runDebate(
      session,
      participants,
      storage,
      {
        async emit(evt: StreamEvent) {
          await appendStreamEvent(sessionId, evt);
        },
      },
      controlPlane,
    );
```

The loss of the `step.run("run-debate", ...)` wrapping means the whole debate re-runs on catastrophic crash (same behavior the comment at `src/lib/inngest/debate-workflow.ts:70-78` already acknowledged as deferred work). Acceptable trade-off to enable pause-wait.

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors. If the `GetFunctionInput` import path is wrong in the installed Inngest version, substitute the correct helper (`Inngest.GetStepTools<...>` exists in newer versions; `any` is an acceptable fallback **only here** with a comment).

- [ ] **Step 5: Lint**

```bash
pnpm lint
```

Expected: 0 errors.

- [ ] **Step 6: Manual verification — workflow still runs unpaused**

With `pnpm inngest:dev` and `pnpm dev` running, create a session and start it. Confirm via the Inngest dashboard (localhost:8288) that `start-debate` runs to completion, turns appear in the UI, and synthesis lands. This confirms the removed `step.run("run-debate")` wrapping didn't break the happy path.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/client.ts src/lib/inngest/control-plane.ts src/lib/inngest/debate-workflow.ts
git commit -m "feat(inngest): durable ControlPlane backed by step.waitForEvent"
```

---

## Task 6: `POST /api/sessions/[id]/inject`

**Files:**
- Create: `src/app/api/sessions/[id]/inject/route.ts`

- [ ] **Step 1: Create the route**

Write `src/app/api/sessions/[id]/inject/route.ts`:

```ts
/**
 * POST /api/sessions/[id]/inject
 *
 * Queues a human note for the next phase boundary. Accepted regardless of
 * whether the session is currently paused — the orchestrator drains the
 * queue between every phase. If the debate has already completed or failed,
 * return 409.
 *
 * Auth: unwired (CLAUDE.md). We use sessions.createdBy as the author.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const body = (await req.json().catch(() => null)) as
    | { content?: unknown }
    | null;
  const content =
    typeof body?.content === "string" ? body.content.trim() : "";

  if (!content) {
    return NextResponse.json(
      { error: "content is required" },
      { status: 400 },
    );
  }
  if (content.length > 4000) {
    return NextResponse.json(
      { error: "content exceeds 4000 chars" },
      { status: 400 },
    );
  }

  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.status === "completed" || session.status === "failed") {
    return NextResponse.json(
      { error: `Cannot inject into session in status "${session.status}"` },
      { status: 409 },
    );
  }

  const authorId = session.createdBy;
  const authorRow = await db.query.users.findFirst({
    where: eq(schema.users.id, authorId),
    columns: { name: true, email: true },
  });
  const authorName = authorRow?.name || authorRow?.email || "Observer";

  const [inserted] = await db
    .insert(schema.pendingInjections)
    .values({
      sessionId,
      content,
      createdBy: authorId,
      createdByName: authorName,
    })
    .returning({ id: schema.pendingInjections.id });

  return NextResponse.json({ id: inserted.id, queued: true });
}
```

- [ ] **Step 2: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: 0 errors each.

- [ ] **Step 3: Manual smoke — POST returns 200 with id**

With the dev stack running and an existing session id `<SID>`:

```bash
curl -X POST http://localhost:3000/api/sessions/<SID>/inject \
  -H "content-type: application/json" \
  -d '{"content":"Focus on 90-day cashflow, not philosophy."}'
```

Expected body: `{"id":"...","queued":true}`. Then:

```bash
psql "$DATABASE_URL" -c "SELECT id, content, delivered_at FROM pending_injections WHERE session_id='<SID>';"
```

Expected: one row, `delivered_at` is NULL.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sessions/\[id\]/inject/route.ts
git commit -m "feat(api): POST /sessions/[id]/inject queues human notes"
```

---

## Task 7: `POST /api/sessions/[id]/pause`

**Files:**
- Create: `src/app/api/sessions/[id]/pause/route.ts`

- [ ] **Step 1: Create the route**

Write `src/app/api/sessions/[id]/pause/route.ts`:

```ts
/**
 * POST /api/sessions/[id]/pause
 *
 * Requests a pause. The orchestrator honors it at the NEXT phase boundary —
 * a turn already in flight finishes naturally. If already paused or already
 * terminal, returns 409.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;

  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (
    session.status === "completed" ||
    session.status === "failed" ||
    session.status === "setup"
  ) {
    return NextResponse.json(
      { error: `Cannot pause session in status "${session.status}"` },
      { status: 409 },
    );
  }
  if (session.pauseRequestedAt) {
    return NextResponse.json({ alreadyPaused: true });
  }

  await db
    .update(schema.sessions)
    .set({ pauseRequestedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.sessions.id, sessionId));

  return NextResponse.json({ pauseRequested: true });
}
```

- [ ] **Step 2: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sessions/\[id\]/pause/route.ts
git commit -m "feat(api): POST /sessions/[id]/pause requests phase-boundary pause"
```

---

## Task 8: `POST /api/sessions/[id]/resume`

**Files:**
- Create: `src/app/api/sessions/[id]/resume/route.ts`

- [ ] **Step 1: Create the route**

Write `src/app/api/sessions/[id]/resume/route.ts`:

```ts
/**
 * POST /api/sessions/[id]/resume
 *
 * Sends the debate.resumed Inngest event that the paused workflow is waiting
 * on. The workflow clears the pause flags in its own transaction (see
 * createInngestControlPlane). We do NOT update the sessions row here — that
 * responsibility lives with the worker so there is a single writer for
 * pause/resume state.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { inngest } from "@/lib/inngest/client";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;

  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (!session.pauseRequestedAt) {
    return NextResponse.json(
      { error: "Session is not paused" },
      { status: 409 },
    );
  }

  await inngest.send({
    name: "debate.resumed",
    data: { sessionId },
  });

  return NextResponse.json({ resumed: true });
}
```

- [ ] **Step 2: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sessions/\[id\]/resume/route.ts
git commit -m "feat(api): POST /sessions/[id]/resume wakes paused workflow"
```

---

## Task 9: Reducer — handle paused phase enter/exit

**Files:**
- Modify: `src/lib/session-ui/reducer.ts`

- [ ] **Step 1: Clear `humanInjectionPrompt` when phase exits `paused`**

In `src/lib/session-ui/reducer.ts`, inside `applyEvent`, the `phase_enter` case (at `src/lib/session-ui/reducer.ts:38`) currently only updates phase, round, and statuses. When the worker re-enters a non-paused phase (after resume), we must clear `humanInjectionPrompt` too, otherwise the overlay stays up:

Replace:

```ts
    case "phase_enter": {
      const personaState = resetStatuses(state.personaState, event.phase);
      return { ...state, phase: event.phase, round: event.round, personaState };
    }
```

with:

```ts
    case "phase_enter": {
      const personaState = resetStatuses(state.personaState, event.phase);
      const humanInjectionPrompt =
        event.phase === "paused" ? state.humanInjectionPrompt : null;
      return {
        ...state,
        phase: event.phase,
        round: event.round,
        personaState,
        humanInjectionPrompt,
      };
    }
```

Note: the orchestrator sets `sessions.status = "paused"` but does not emit a `phase_enter: "paused"` event explicitly — only `human_injection_request`. That case already sets `humanInjectionPrompt` and flips phase to `"paused"` (at `src/lib/session-ui/reducer.ts:138`). The change above handles the **exit** path: when the next real phase emits `phase_enter`, the overlay closes.

- [ ] **Step 2: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/session-ui/reducer.ts
git commit -m "feat(ui/reducer): clear injection prompt when phase exits paused"
```

---

## Task 10: UI — wire Pause / Interject / Resume buttons to the APIs

**Files:**
- Modify: `src/components/session/layout/SessionShell.tsx`

- [ ] **Step 1: Replace button handlers with API-calling versions**

Edit `src/components/session/layout/SessionShell.tsx`. Replace the full body of the component (keeping the imports) with:

```tsx
export function SessionShell({ bundle }: { bundle: HydrationBundle }) {
  const state = useSessionStream(bundle);
  const insights = deriveInsights(state);
  const [pausePending, setPausePending] = useState(false);
  const [resumePending, setResumePending] = useState(false);

  const sessionId = state.sessionId;
  const isPaused = state.phase === "paused" || state.humanInjectionPrompt !== null;
  const activeSpeakerId = state.live?.speakerId ?? null;
  const isSynthesisDone = state.phase === "completed" && state.synthesis !== null;

  const requestPause = useCallback(async () => {
    if (pausePending) return;
    setPausePending(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/pause`, { method: "POST" });
      if (!res.ok) {
        console.error("pause failed", await res.text());
      }
    } finally {
      setPausePending(false);
    }
  }, [pausePending, sessionId]);

  const requestResume = useCallback(async () => {
    if (resumePending) return;
    setResumePending(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/resume`, { method: "POST" });
      if (!res.ok) {
        console.error("resume failed", await res.text());
      }
    } finally {
      setResumePending(false);
    }
  }, [resumePending, sessionId]);

  const submitInjection = useCallback(
    async (content: string) => {
      const res = await fetch(`/api/sessions/${sessionId}/inject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        console.error("inject failed", await res.text());
        return;
      }
      await requestResume();
    },
    [sessionId, requestResume],
  );

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-bg-chamber)] text-[var(--color-text-primary)]">
      <TopBar
        session={state.session}
        phase={state.phase}
        round={state.round}
        totalCostUsd={state.totalCostUsd}
      />
      <PhaseBar phase={state.phase} />

      {state.error && (
        <div
          role="alert"
          className="border-b border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-6 py-2 text-sm text-[var(--color-danger)]"
        >
          {state.error}
        </div>
      )}

      {isSynthesisDone && state.synthesis ? (
        <main className="flex-1 overflow-y-auto">
          <SynthesisPanel artifact={state.synthesis} />
        </main>
      ) : (
        <>
          <div className="relative flex min-h-[380px]">
            <PersonaRail
              personas={state.personas}
              personaState={state.personaState}
            />
            <div className="relative flex flex-1 items-stretch">
              <CouncilStage
                personas={state.personas}
                personaState={state.personaState}
                activeSpeakerId={activeSpeakerId}
                paused={isPaused}
              />
              <AnimatePresence>
                {isPaused && (
                  <PausedOverlay
                    prompt={state.humanInjectionPrompt}
                    onSubmit={submitInjection}
                    onCancel={requestResume}
                  />
                )}
              </AnimatePresence>
            </div>
            <InsightRail insights={insights} />
          </div>
          <TranscriptDrawer
            turns={state.turns}
            live={state.live}
            consensusReports={state.consensusReports}
            personas={state.personas}
          />
        </>
      )}

      <StickyActionBar
        phase={
          isSynthesisDone ? "completed" : isPaused ? "paused" : state.phase
        }
        canExport={isSynthesisDone}
        onPauseToggle={isPaused ? requestResume : requestPause}
        onInterject={requestPause}
        onAskRound={requestPause /* TODO: replace when ask-round plan ships */}
        onExport={() => {
          if (!state.synthesis) return;
          const content =
            state.synthesis.transcriptMarkdown || state.synthesis.decision;
          const blob = new Blob([content], {
            type: "text/markdown;charset=utf-8",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `parloir-session-${sessionId.slice(0, 8)}.md`;
          a.click();
          URL.revokeObjectURL(url);
        }}
      />
    </div>
  );
}
```

Update the imports at the top of the file to add `useCallback` alongside `useState`:

```ts
import { useCallback, useState } from "react";
```

- [ ] **Step 2: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/session/layout/SessionShell.tsx
git commit -m "feat(ui): wire Pause / Interject / Resume to API"
```

---

## Task 11: Manual end-to-end verification

**Files:** none (observational)

- [ ] **Step 1: Start the dev stack**

```bash
pnpm inngest:dev  # Terminal A
pnpm dev          # Terminal B
```

- [ ] **Step 2: Start a debate**

Navigate to `http://localhost:3000/sessions/new`, create a session with at least 2 template personas using `ollama/llama3.2` (cheap), launch it. Confirm turns stream in.

- [ ] **Step 3: Pause mid-debate**

During a critique round, click **Pause** in the sticky action bar. Expected:
- Within ~1 turn, the paused overlay appears.
- Inngest dashboard (localhost:8288) shows the `start-debate` run in "waiting" state with a `debate.resumed` wait listed.
- `SELECT status, pause_requested_at, paused_at_phase FROM sessions WHERE id = '<SID>';` shows `paused` / non-null / the phase we paused in.

- [ ] **Step 4: Resume without note**

Click **Resume without interjecting**. Expected:
- Overlay disappears within ~1s.
- Inngest run resumes; next `phase_enter` appears in the transcript drawer.
- `pause_requested_at` is NULL again.

- [ ] **Step 5: Pause, inject, resume**

Pause again, type "Assume a 90-day cash runway, not 12 months." and click Send. Expected:
- A human Turn with speakerRole=`human` appears in the transcript at the current phase.
- The next agent turn's prompt context contains the injection (inspect via Inngest's event payload or by reading the next turn — it should reference the 90-day framing).
- The session resumes and completes synthesis.

- [ ] **Step 6: Inject while running (no pause)**

Start a fresh session. While a critique round is running, curl the inject endpoint directly:

```bash
curl -X POST http://localhost:3000/api/sessions/<SID>/inject \
  -H "content-type: application/json" \
  -d '{"content":"One constraint: budget cap $10k."}'
```

Expected: the injection appears at the NEXT phase boundary (not mid-turn), and the subsequent agents see it. No pause happens — drain runs regardless.

- [ ] **Step 7: Commit documentation update**

Add a short paragraph to `CLAUDE.md` under "Known gaps to be aware of" removing the three items now covered, and add a new section "Pause/Inject/Resume" with a two-line summary.

```bash
git add CLAUDE.md
git commit -m "docs: pause/inject/resume is live; update known gaps"
```

---

## Follow-up plans (explicitly out of scope)

These were triaged out of this plan. Each deserves its own plan document.

### Plan: Turn cost extraction (#5)
- Read provider cost metadata from `result.usage` / provider response headers in `runAgentTurn` (`src/lib/orchestrator/protocol.ts:336-350`).
- For OpenRouter, cost arrives in the response body's `usage` object. For Anthropic/OpenAI/Google direct, compute from token counts × per-model price table.
- Write computed value to `turn.costUsd`; the UI already sums it.
- Small, self-contained: one-file change plus a `pricing.ts` constants table.

### Plan: Ask another round / Ask persona (#3)
- **Design decision required first:** is an "extra round" a re-entry into `runCritiqueRound` (same protocol semantics, same novelty rule) or a new phase type `"user_requested_round"` with different rules?
- Trade-off: re-entry is simpler but may produce sycophantic turns because the consensus check has already shipped. A new phase with a reframed system prompt ("The human asked for another look at X") is more expressive.
- Can only start *after* synthesis has run — the UI's "Ask another round" implies the debate has stalled. Needs a new API `POST /api/sessions/[id]/continue` that re-triggers the Inngest workflow with a `continueFrom` marker.
- Defer until a product conversation resolves the above.

### Plan: Auth scoping + DB personas (#6, #7)
- Both block on real auth. #6 filters `GET /api/sessions` by `createdBy = currentUser`. #7 extends `loadPersona` to query the `personas` table by id, falling through to templates only if the id is a known template slug.

### Plan: Session title edit (#8)
- `PATCH /api/sessions/[id]` with `{ title }`; add an inline editable title in `TopBar`.

---

## Self-Review

**Spec coverage** (against the user's list):

| Gap | Addressed by |
|-----|--------------|
| #1 Pause/Resume | Tasks 4, 5, 7, 8, 10 |
| #2 Human interjection + wait point | Tasks 1, 3, 4, 5, 6, 10 |
| #4 Checkpoint resume | Task 5 (Inngest `waitForEvent` is durable; resume lands at the exact boundary). Catastrophic-crash resume deferred. |
| #3 Ask-round | Explicitly out of scope; see Follow-up plans. |
| #5 Cost | Explicitly out of scope; see Follow-up plans. |
| #6, #7, #8 | Explicitly out of scope; see Follow-up plans. |

**Placeholder scan:**
- "TBD / TODO / implement later" — only one `TODO: replace when ask-round plan ships` comment in Task 10 UI wiring, which is a deliberate pointer to the follow-up plan, not a placeholder.
- All code blocks contain full implementations. All commands have expected output.

**Type consistency:**
- `HumanInjection` fields (`id`, `sessionId`, `content`, `createdBy`, `createdByName`, `createdAt`) match across `types.ts`, schema (`pending_injections` columns), `drainPendingInjections` return shape, and the `ControlPlane.drainInjections` consumer in Task 4.
- `ControlPlane` methods (`drainInjections`, `waitIfPauseRequested`, `isPauseRequested`, `markPausedAtPhase`) are identical in the interface (Task 3), the Inngest factory (Task 5), and the call sites (Task 4).
- Stream event `human_injection_request` is emitted by Task 4 and consumed by the existing reducer at `src/lib/session-ui/reducer.ts:138`.

No gaps found.
