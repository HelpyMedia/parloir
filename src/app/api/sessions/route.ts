/**
 * POST /api/sessions — create a new debate session.
 *
 * Body: {
 *   title: string,
 *   question: string,
 *   context?: string,
 *   personaIds: string[],       // 2-5 personas
 *   protocol?: Partial<ProtocolConfig>
 * }
 *
 * Returns the created session. Client then POSTs to /start to kick off the debate.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { DEFAULT_PROTOCOL } from "@/lib/orchestrator/types";

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
  // TODO: pull from authenticated user once auth is wired
  createdBy: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const input = parsed.data;

  const protocol = { ...DEFAULT_PROTOCOL, ...(input.protocol ?? {}) };

  try {
    const [session] = await db
      .insert(schema.sessions)
      .values({
        title: input.title,
        question: input.question,
        context: input.context,
        protocol,
        createdBy: input.createdBy,
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
