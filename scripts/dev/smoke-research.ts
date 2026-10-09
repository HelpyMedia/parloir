/**
 * Smoke test for web research against real OpenRouter. Costs a few cents.
 *
 *   PARLOIR_DEV_INHERIT_ENV=1 OPENROUTER_API_KEY=sk-or-... pnpm smoke:research
 *
 * Runs the research gate and one webResearch call, prints the decision, the
 * sources and the cost, then makes one raw web-plugin call to settle whether
 * OpenRouter's reported cost already includes the $0.007 search fee
 * (src/lib/research/web.ts adds it when the reported cost can't include it).
 *
 * Optional: PARLOIR_SMOKE_MODEL=openrouter/<slug> (default: the catalog's
 * free judge, so any cost OpenRouter reports is the search fee; the account
 * needs credit all the same), PARLOIR_SMOKE_QUESTION="…".
 */
import { generateText } from "ai";
import { getCatalog, pickJudge } from "../../src/lib/providers/openrouter-catalog";
import { resolveOpenRouterModel } from "../../src/lib/providers/registry";
import { decideResearch } from "../../src/lib/research/gate";
import { webResearch } from "../../src/lib/research/web";
import { WEB_SEARCH_FEE_USD } from "../../src/lib/research/limits";
import type { ProviderContext } from "../../src/lib/orchestrator/types";

const QUESTION =
  process.env.PARLOIR_SMOKE_QUESTION ??
  "Should a 10-person marketing agency use GrokBot or OpenAI Dots for client deliverables?";

async function main() {
  if (process.env.PARLOIR_DEV_INHERIT_ENV !== "1" || !process.env.OPENROUTER_API_KEY) {
    console.error("Set PARLOIR_DEV_INHERIT_ENV=1 and OPENROUTER_API_KEY to run this smoke test.");
    process.exit(1);
  }
  // Empty: the registry falls back to process.env under PARLOIR_DEV_INHERIT_ENV.
  const ctx: ProviderContext = { cloud: {}, local: {} };
  const catalog = await getCatalog();
  const modelId = process.env.PARLOIR_SMOKE_MODEL ?? pickJudge(catalog, [])!;
  const model = catalog.find((m) => m.id === modelId);
  console.log(`model: ${modelId} (${model ? `$${model.promptPerM}/$${model.completionPerM} per M` : "not in catalog"})`);
  const today = new Date().toISOString().slice(0, 10);

  const gate = await decideResearch({ question: QUESTION, context: "", modelChain: [modelId], ctx, today });
  console.log("\n── gate");
  console.log(JSON.stringify(gate, null, 2));

  const query = gate.queries[0] ?? QUESTION;
  const r = await webResearch({ ctx, modelId, query });
  console.log(`\n── webResearch("${query}")`);
  if (!r.ok) {
    console.log(`failed: ${r.code} — ${r.message}`);
  } else {
    console.log(r.summary);
    for (const s of r.sources) console.log(`- ${s.title} — ${s.url} (${s.excerpt.length} chars of excerpt)`);
    console.log(`cost as recorded: $${r.costUsd.toFixed(5)} (${r.tokensIn} in / ${r.tokensOut} out)`);
  }

  // Raw call: compare OpenRouter's reported cost with the token price.
  const raw = await generateText({
    model: resolveOpenRouterModel(modelId, ctx, { plugins: [{ id: "web", engine: "exa", max_results: 5 }] }),
    messages: [{ role: "user", content: query }],
    maxOutputTokens: 200,
    providerOptions: { openrouter: { usage: { include: true } } },
  });
  const usage = (raw.providerMetadata?.openrouter as { usage?: { cost?: number } } | undefined)?.usage;
  const reported = usage?.cost ?? null;
  const tokens =
    model && raw.usage.inputTokens !== undefined && raw.usage.outputTokens !== undefined
      ? (raw.usage.inputTokens * model.promptPerM + raw.usage.outputTokens * model.completionPerM) / 1_000_000
      : null;
  console.log("\n── search fee");
  console.log(`reported cost: ${reported === null ? "none" : `$${reported.toFixed(5)}`}`);
  console.log(`token cost at catalog prices: ${tokens === null ? "unknown" : `$${tokens.toFixed(5)}`}`);
  if (reported !== null && tokens !== null) {
    const includes = reported - tokens >= WEB_SEARCH_FEE_USD * 0.8;
    console.log(
      includes
        ? `→ the reported cost INCLUDES the $${WEB_SEARCH_FEE_USD} search fee.`
        : `→ the reported cost does NOT include the $${WEB_SEARCH_FEE_USD} search fee.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
