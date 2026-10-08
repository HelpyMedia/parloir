/**
 * POST /api/sessions — create a new debate session.
 *
 * Body: {
 *   title: string,
 *   question: string,
 *   context?: string,
 *   personaIds: string[],              // 2-5 personas
 *   protocol?: Partial<ProtocolConfig>,
 *   participantOverrides?: Record<string, string>,  // personaId → modelId
 *   tier?: "free"|"low"|"medium"|"high", // fills missing models (freeOnly: legacy)
 *   locale?: "en" | "fr",
 * }
 *
 * Returns the created session. Client then POSTs to /start to kick off the debate.
 * Auth: derived from session cookie via requireUser() — no createdBy in body.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { DEFAULT_PROTOCOL } from "@/lib/orchestrator/types";
import { requireUser } from "@/lib/auth/server";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit/token-bucket";
import { respondServerError } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/csrf";
import { syncTemplatePersonas } from "@/lib/personas/sync";
import { isAllowedModelId } from "@/lib/config/edition";
import { listConnectedProviders } from "@/lib/credentials/service";
import { completeModelPicks, MissingModelError } from "@/lib/sessions/model-picks";
import { checkSessionQuota } from "@/lib/sessions/quota";
import { MODEL_TIERS } from "@/lib/models/tiers";

class SessionCreateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionCreateValidationError";
  }
}

// "<provider>/<model>" with a bounded character set, so a client can't stash
// megabytes or control characters in the row.
const ModelId = z
  .string()
  .max(200)
  .regex(/^[a-z0-9_-]+\/[A-Za-z0-9._:\-/]{1,180}$/);

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  question: z.string().min(10).max(4000),
  context: z.string().max(20_000).optional().default(""),
  personaIds: z.array(z.string()).min(2).max(5),
  protocol: z
    .object({
      maxCritiqueRounds: z.number().int().min(0).max(5).optional(),
      consensusThreshold: z.number().min(0).max(1).optional(),
      enableAdaptiveRound: z.boolean().optional(),
      hideConfidenceScores: z.boolean().optional(),
      requireNovelty: z.boolean().optional(),
      judgeModel: z.union([ModelId, z.literal("")]).optional(),
      synthesizerModel: z.union([ModelId, z.literal("")]).optional(),
    })
    .optional(),
  participantOverrides: z.record(z.string(), ModelId).optional(),
  // Which model tier fills panelists without an explicit model. `freeOnly`
  // is the older form of the same choice.
  tier: z.enum(MODEL_TIERS).optional(),
  freeOnly: z.boolean().optional().default(false),
  locale: z.enum(["en", "fr"]).optional(),
});

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  // Auth check before any DB work so auth errors surface as 401/redirect, not 500.
  const user = await requireUser();

  const limited = await withRateLimit(
    req,
    "session:create",
    RATE_LIMITS.sessionWrite,
    user.id,
    async () => null,
  );
  if (limited instanceof NextResponse) return limited;

  const quota = await checkSessionQuota(user.id);
  if (!quota.ok) {
    return NextResponse.json({ error: quota.message, code: quota.code }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const input = parsed.data;
  const uniquePersonaIds = [...new Set(input.personaIds)];
  if (uniquePersonaIds.length !== input.personaIds.length) {
    return NextResponse.json({ error: "personaIds must not contain duplicates" }, { status: 400 });
  }

  const requestedModels = [
    ...Object.entries(input.participantOverrides ?? {}),
    ["judge", input.protocol?.judgeModel ?? ""],
    ["secretary", input.protocol?.synthesizerModel ?? ""],
  ] as Array<[string, string]>;
  for (const [who, modelId] of requestedModels) {
    if (!modelId) continue;
    if (who !== "judge" && who !== "secretary" && !uniquePersonaIds.includes(who)) {
      return NextResponse.json(
        { error: `Model given for "${who}", who is not on this panel.` },
        { status: 400 },
      );
    }
    if (!isAllowedModelId(modelId)) {
      return NextResponse.json(
        { error: `"${modelId}" is not a model this server can run.` },
        { status: 400 },
      );
    }
  }

  let picks;
  try {
    const connected = await listConnectedProviders(user.id);
    picks = await completeModelPicks({
      personaIds: uniquePersonaIds,
      overrides: input.participantOverrides ?? {},
      judgeModel: input.protocol?.judgeModel ?? "",
      synthesizerModel: input.protocol?.synthesizerModel ?? "",
      tier: input.tier ?? (input.freeOnly ? "free" : "low"),
      openRouterAvailable: connected.includes("openrouter"),
    });
  } catch (err) {
    if (err instanceof MissingModelError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return respondServerError("POST /api/sessions (model picks)", err);
  }

  const protocol = {
    ...DEFAULT_PROTOCOL,
    ...(input.protocol ?? {}),
    judgeModel: picks.judgeModel,
    synthesizerModel: picks.synthesizerModel,
    locale: input.locale ?? "en",
  };

  try {
    const session = await db.transaction(async (tx) => {
      const templates = await syncTemplatePersonas(tx);
      const knownPersonaIds = new Set(templates.map((persona) => persona.id));
      const unknownPersonaIds = uniquePersonaIds.filter((id) => !knownPersonaIds.has(id));
      if (unknownPersonaIds.length > 0) {
        throw new SessionCreateValidationError(
          `Unknown persona ID(s): ${unknownPersonaIds.join(", ")}`,
        );
      }

      const [createdSession] = await tx
        .insert(schema.sessions)
        .values({
          title: input.title,
          question: input.question,
          context: input.context,
          protocol,
          createdBy: user.id,
          participantModelOverrides: picks.overrides,
          status: "setup",
        })
        .returning();

      await tx.insert(schema.participants).values(
        uniquePersonaIds.map((personaId, seatIndex) => ({
          sessionId: createdSession.id,
          personaId,
          seatIndex,
          silenced: false,
        })),
      );

      return createdSession;
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    if (err instanceof SessionCreateValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return respondServerError("POST /api/sessions", err);
  }
}
