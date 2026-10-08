/**
 * Structured output with graceful degradation.
 *
 * Walks a chain of candidate models. For each one we first try native
 * structured output (generateObject). Many models — free ones especially —
 * don't support JSON-schema response formats, so on failure we retry the same
 * model in plain-text mode with the schema described in the prompt and parse
 * the first JSON object out of the reply. Null means every attempt failed;
 * callers decide how to degrade.
 */

import { generateObject, generateText, zodSchema, type ModelMessage } from "ai";
import type { z } from "zod";
import { resolveModel } from "../providers/registry";
import type { ProviderContext } from "./types";

export interface TryGenerateObjectResult<T> {
  object: T;
  modelId: string;
}

/**
 * Distinguishes classifier / consensus / synthesis calls from persona-turn
 * calls so hosted billing can tag the provider attempt.
 */
export type TryGenerateObjectAttemptKind = "primary" | "classifier" | "consensus" | "synthesis";

const CALL_TIMEOUT_MS = 150_000;
/** Below this much remaining budget we don't start another attempt. */
const MIN_ATTEMPT_MS = 15_000;

/** Abort signal for one attempt, bounded by the caller's overall deadline. */
export function attemptSignal(deadline: number | undefined): AbortSignal | null {
  const remaining = deadline === undefined ? CALL_TIMEOUT_MS : deadline - Date.now();
  if (remaining < MIN_ATTEMPT_MS) return null;
  return AbortSignal.timeout(Math.min(CALL_TIMEOUT_MS, remaining));
}

const providerOptions = (effort: "low" | "medium") => ({
  openrouter: {
    usage: { include: true },
    reasoning: { effort, exclude: true },
  },
});

/** Pull the first balanced {...} block out of a model reply. */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1] : text;
  const start = source.indexOf("{");
  if (start === -1) throw new Error("no JSON object in reply");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(source.slice(start, i + 1));
    }
  }
  throw new Error("unterminated JSON object in reply");
}

export async function tryGenerateObject<T>(params: {
  modelChain: string[];
  ctx: ProviderContext;
  schema: z.ZodType<T>;
  temperature?: number;
  messages: ModelMessage[];
  attemptKind?: TryGenerateObjectAttemptKind;
  /** Reasoning effort for models that support it. */
  effort?: "low" | "medium";
  /**
   * Epoch ms after which no new attempt starts. Keeps the whole chain inside
   * one durable step's time budget.
   */
  deadline?: number;
}): Promise<TryGenerateObjectResult<T> | null> {
  const { modelChain, ctx, schema, temperature, messages, effort = "low" } = params;
  const errors: Array<{ modelId: string; mode: string; err: string }> = [];

  const jsonSchema = JSON.stringify(zodSchema(schema).jsonSchema);
  const textModeMessages: ModelMessage[] = [
    ...messages,
    {
      role: "user",
      content:
        "Reply with ONLY a single JSON object (no prose, no code fences) that validates against this JSON Schema:\n" +
        jsonSchema,
    },
  ];

  for (const modelId of modelChain) {
    let model;
    try {
      model = ctx.resolveModel ? ctx.resolveModel(modelId) : resolveModel(modelId, ctx);
    } catch (e) {
      errors.push({ modelId, mode: "resolve", err: e instanceof Error ? e.message : String(e) });
      continue;
    }

    const structuredSignal = attemptSignal(params.deadline);
    if (!structuredSignal) break;
    try {
      const result = await generateObject({
        model,
        schema,
        temperature,
        messages,
        maxRetries: 1,
        abortSignal: structuredSignal,
        providerOptions: providerOptions(effort),
      });
      return { object: result.object as T, modelId };
    } catch (e) {
      errors.push({ modelId, mode: "structured", err: e instanceof Error ? e.message : String(e) });
    }

    const textSignal = attemptSignal(params.deadline);
    if (!textSignal) break;
    try {
      const { text } = await generateText({
        model,
        temperature,
        messages: textModeMessages,
        maxRetries: 1,
        abortSignal: textSignal,
        providerOptions: providerOptions(effort),
      });
      const parsed = schema.safeParse(extractJsonObject(text));
      if (parsed.success) return { object: parsed.data, modelId };
      errors.push({ modelId, mode: "text-json", err: parsed.error.message.slice(0, 300) });
    } catch (e) {
      errors.push({ modelId, mode: "text-json", err: e instanceof Error ? e.message : String(e) });
    }
  }

  console.warn("tryGenerateObject: all candidates failed", { errors });
  return null;
}
