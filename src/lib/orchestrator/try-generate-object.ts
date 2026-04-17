/**
 * Call generateObject against a chain of models, falling through on failure.
 * Small local models frequently fail to produce valid structured output for
 * nested Zod schemas; rather than crashing the session, we walk a preference
 * chain (desired first, then cloud prefs, then persona models) and return
 * the first success. Null means every candidate failed — callers decide
 * how to degrade.
 *
 * Note: AI SDK v5 dropped the `mode: "json" | "tool" | "auto"` knob that
 * earlier drafts of this helper relied on. The only lever we have now is
 * swapping the underlying model, which is exactly what the chain does.
 */

import { generateObject, type ModelMessage } from "ai";
import type { z } from "zod";
import { resolveModel } from "@/lib/providers/registry";
import type { ProviderContext } from "./types";

export interface TryGenerateObjectResult<T> {
  object: T;
  modelId: string;
}

export async function tryGenerateObject<T>(params: {
  modelChain: string[];
  ctx: ProviderContext;
  schema: z.ZodType<T>;
  temperature?: number;
  messages: ModelMessage[];
}): Promise<TryGenerateObjectResult<T> | null> {
  const { modelChain, ctx, schema, temperature, messages } = params;
  const errors: Array<{ modelId: string; err: string }> = [];

  for (const modelId of modelChain) {
    try {
      const result = await generateObject({
        model: resolveModel(modelId, ctx),
        schema,
        temperature,
        messages,
      });
      return { object: result.object as T, modelId };
    } catch (e) {
      errors.push({
        modelId,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  console.warn("tryGenerateObject: all candidates failed", { errors });
  return null;
}
