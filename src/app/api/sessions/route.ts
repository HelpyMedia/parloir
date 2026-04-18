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

// Provider prefixes accepted as model override values.
const VALID_PROVIDER_PREFIX = /^(anthropic|openai|google|openrouter|ollama|lmstudio|vllm)\//;

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
  participantOverrides: z.record(z.string(), z.string()).optional(),
});

export async function POST(req: NextRequest) {
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

  // Validate provider prefixes on any model overrides.
  if (input.participantOverrides) {
    for (const [personaId, modelId] of Object.entries(input.participantOverrides)) {
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
    const [session] = await db
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

    await db.insert(schema.participants).values(
      input.personaIds.map((personaId, seatIndex) => ({
        sessionId: session.id,
        personaId,
        seatIndex,
        silenced: false,
      })),
    );

    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/sessions] failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
