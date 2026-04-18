/**
 * POST /api/sessions — create a new debate session.
 *
 * Body: {
 *   title: string,
 *   question: string,
 *   context?: string,
 *   personaIds: string[],              // 2-5 personas
 *   protocol?: Partial<ProtocolConfig>,
 *   participantOverrides?: Record<string, string>  // personaId → modelId
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

// Provider prefixes accepted as model override values.
const VALID_PROVIDER_PREFIX = /^(anthropic|openai|google|openrouter|ollama|lmstudio|vllm)\//;

class SessionCreateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionCreateValidationError";
  }
}

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
      judgeModel: z.string().optional(),
      synthesizerModel: z.string().optional(),
    })
    .optional(),
  // Value matches "<provider>/<model>"; provider slug is lowercase, model
  // is a bounded set of characters the upstream SDKs accept. Also bounds
  // overall length so a malicious client can't stash megabytes in the row.
  participantOverrides: z
    .record(
      z.string(),
      z
        .string()
        .max(200)
        .regex(/^[a-z0-9_-]+\/[A-Za-z0-9._:\-/]{1,180}$/),
    )
    .optional(),
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

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const input = parsed.data;
  const uniquePersonaIds = [...new Set(input.personaIds)];

  if (uniquePersonaIds.length !== input.personaIds.length) {
    return NextResponse.json(
      { error: "personaIds must not contain duplicates" },
      { status: 400 },
    );
  }

  // Validate provider prefixes on any model overrides.
  if (input.participantOverrides) {
    for (const [personaId, modelId] of Object.entries(input.participantOverrides)) {
      if (!uniquePersonaIds.includes(personaId)) {
        return NextResponse.json(
          {
            error: `Invalid model override for persona "${personaId}": the persona is not part of this session.`,
          },
          { status: 400 },
        );
      }
      if (!VALID_PROVIDER_PREFIX.test(modelId)) {
        return NextResponse.json(
          {
            error: `Invalid model override for persona "${personaId}": "${modelId}" does not start with a recognised provider prefix (anthropic/, openai/, google/, openrouter/, ollama/, lmstudio/, vllm/).`,
          },
          { status: 400 },
        );
      }
    }
  }

  const protocol = { ...DEFAULT_PROTOCOL, ...(input.protocol ?? {}) };

  try {
    const session = await db.transaction(async (tx) => {
      const templates = await syncTemplatePersonas(tx);
      const knownPersonaIds = new Set(templates.map((persona) => persona.id));
      const unknownPersonaIds = uniquePersonaIds.filter(
        (personaId) => !knownPersonaIds.has(personaId),
      );

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
          participantModelOverrides: input.participantOverrides ?? {},
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
