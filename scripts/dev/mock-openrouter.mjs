// Local stand-in for OpenRouter, for running full debates without spending
// anything or needing network access. Start it, then set
//   PARLOIR_OPENROUTER_BASE_URL=http://localhost:4010/api/v1
// in .env.local and save any string as your OpenRouter key in Settings.
//
// - GET  /api/v1/models            small catalog (free + paid, benchmarks)
// - POST /api/v1/chat/completions  streaming or JSON; json_schema honored
// Model ids containing "broken" return 429 (exercise skipped turns);
// "gated" return OpenRouter's 403 for free models limited to partner apps;
// "overloaded" return 503; "slowpoke" hangs 200s (exercise timeouts);
// ":batch" variants (Batch API only) return 404 like OpenRouter does;
// "onlyonce" answers its first call and returns 429 after that (a model that
// fails mid-debate).
// GET /api/v1/key reports a free-tier account when the key contains
// "freetier", otherwise a paid one with $25 left.
//
// Web research: requests with plugins [{ id: "web" }] answer with a summary
// and 2 fake url_citation annotations per query, or 402 (no credits) when
// the key contains "freetier". The research gate says no search is needed
// for questions about a cofounder / hiring (see MOCK_NO_RESEARCH), otherwise
// it searches. Tool-capable models call web_search once in critique round 1.
import http from "node:http";

const PORT = Number(process.env.PORT ?? 4010);
const now = Math.floor(Date.now() / 1000);

const models = [
  ["mocklab/genius-pro", "MockLab: Genius Pro", "0.000003", "0.000015", 60, ["structured_outputs", "response_format", "tools"]],
  ["alpha/thinker-7", "Alpha: Thinker 7", "0.000001", "0.000004", 50, ["response_format", "tools"]],
  ["beta/chat-large:free", "Beta: Chat Large (free)", "0", "0", 45, ["tools"]],
  ["gamma/reasoner:free", "Gamma: Reasoner (free)", "0", "0", 40, ["structured_outputs", "tools"]],
  ["delta/mini:free", "Delta: Mini (free)", "0", "0", null, []],
  ["epsilon/broken:free", "Epsilon: Broken (free)", "0", "0", 30, []],
  ["theta/gated:free", "Theta: Gated (free)", "0", "0", 55, []],
  ["kappa/value-chat", "Kappa: Value Chat", "0.0000002", "0.0000008", 42, ["response_format", "tools"]],
  ["mu/mid-pro:batch", "Mu: Mid Pro (batch)", "0.00000075", "0.000004", 58, ["structured_outputs"]],
  ["xi/onlyonce", "Xi: Only Once", "0.0000002", "0.0000008", 30, []],
  ["lambda/budget", "Lambda: Budget", "0.0000005", "0.000002", 38, ["structured_outputs", "tools"]],
  ["mu/mid-pro", "Mu: Mid Pro", "0.0000015", "0.000008", 58, ["structured_outputs", "tools"]],
  ["nu/frontier-max", "Nu: Frontier Max", "0.00001", "0.00004", 70, ["structured_outputs", "tools"]],
  ["iota/overloaded:free", "Iota: Overloaded (free)", "0", "0", 20, []],
  ["zeta/tiny", "Zeta: Tiny 8K", "0.0000001", "0.0000001", 10, []],
].map(([id, name, prompt, completion, iq, params], i) => ({
  id,
  name,
  created: now - i * 86400,
  context_length: id.includes("tiny") ? 8000 : 128000,
  pricing: { prompt, completion },
  architecture: { input_modalities: ["text"], output_modalities: ["text"] },
  supported_parameters: ["temperature", "max_tokens", ...params],
  benchmarks: iq === null ? undefined : { artificial_analysis: { intelligence_index: iq } },
}));
models.push({
  id: "openrouter/auto", name: "Auto Router", created: now, context_length: 2000000,
  pricing: { prompt: "-1", completion: "-1" },
  architecture: { input_modalities: ["text"], output_modalities: ["text"] }, supported_parameters: [],
});
models.push({
  id: "img/painter", name: "Image only", created: now, context_length: 4000,
  pricing: { prompt: "0", completion: "0" },
  architecture: { input_modalities: ["text"], output_modalities: ["image"] }, supported_parameters: [],
});

// Set per request: whether the prompt carries a source list, so the mock
// synthesis can cite a real [S1] next to an invented [S42] and URL.
let withSources = false;
const NO_RESEARCH = new RegExp(process.env.MOCK_NO_RESEARCH ?? "cofounder|cofondateur|before or after our", "i");

/** The research gate's answer for this conversation. */
function gateAnswer(text) {
  if (NO_RESEARCH.test(text)) return { needsWeb: false, reason: "The person supplied the facts.", queries: [] };
  return {
    needsWeb: true,
    reason: "Mentions named products that may postdate training.",
    queries: ["GrokBot pricing and features", "OpenAI Dots release"],
  };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

function citations(query) {
  return [1, 2].map((n) => ({
    type: "url_citation",
    url_citation: {
      url: `https://example.com/mock-search/${slug(query)}-${n}`,
      title: `Mock result ${n} for "${query}"`,
      content: `Excerpt ${n}: what a page says about ${query}. Prices start at $${n * 10} per seat per month.`,
      start_index: 0,
      end_index: 10,
    },
  }));
}

function fromSchema(schema, path = "") {
  if (!schema) return null;
  if (schema.properties?.needsWeb) return gateAnswer(lastGateText);
  if (schema.enum) {
    if (path.endsWith("recommendation")) return process.env.MOCK_RECOMMEND ?? schema.enum[0];
    return schema.enum[0];
  }
  switch (schema.type) {
    case "object": {
      const o = {};
      for (const [k, v] of Object.entries(schema.properties ?? {})) o[k] = fromSchema(v, `${path}.${k}`);
      return o;
    }
    case "array":
      if (path.endsWith("personaIds")) return ["domain_expert", "skeptical_auditor", "nope"];
      if (path.endsWith(".models")) return [
        { personaId: "domain_expert", modelId: "openrouter/beta/chat-large:free" },
        { personaId: "skeptical_auditor", modelId: "openrouter/not-in-list" },
      ];
      return [fromSchema(schema.items, `${path}[]`)];
    case "number":
    case "integer":
      return path.endsWith("consensusLevel") ? 0.55 : 0.7;
    case "boolean":
      return true;
    case "string":
      if (path.endsWith("title")) return "Mock suggested title";
      if (path.endsWith("decision"))
        return withSources
          ? "Adopt option B with a staged rollout [S1] [S42]; see https://invented.example/fake for details."
          : "Adopt option B with a staged rollout.";
      return `mock ${path.split(".").pop()}`;
    default:
      return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const calls = [];
let lastGateText = "";
const toolCallOnce = new Set();

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === "GET" && url.pathname === "/api/v1/key") {
      const freeTier = (req.headers.authorization ?? "").includes("freetier");
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ data: {
        label: "mock", is_free_tier: freeTier, limit: freeTier ? null : 25,
        limit_remaining: freeTier ? null : 25, usage: 0, usage_daily: 0,
      } }));
    }
    if (req.method === "GET" && url.pathname === "/api/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ data: models }));
    }
    if (req.method === "GET" && url.pathname === "/calls") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(calls));
    }
    if (req.method === "POST" && url.pathname === "/api/v1/chat/completions") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body);
      const model = payload.model;
      const system = payload.messages?.find((m) => m.role === "system")?.content ?? "";
      const kind = payload.response_format?.type === "json_schema" ? "json" : payload.stream ? "stream" : "text";
      const web = (payload.plugins ?? []).some((p) => p.id === "web");
      calls.push({ model, kind, web, at: Date.now(), auth: req.headers.authorization?.slice(0, 12), title: req.headers["x-title"] });
      const convo = JSON.stringify(payload.messages);
      withSources = /SOURCES/.test(convo);
      lastGateText = (payload.messages ?? []).filter((m) => m.role === "user").map((m) => JSON.stringify(m.content)).join(" ");

      if (model.includes("broken")) {
        res.writeHead(429, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { code: 429, message: "Rate limit exceeded: free-models-per-day" } }));
      }
      if (model.includes("onlyonce") && calls.filter((c) => c.model === model).length > 1) {
        res.writeHead(429, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { code: 429, message: "Rate limit exceeded" } }));
      }
      if (model.endsWith(":batch")) {
        res.writeHead(404, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { code: 404, message: `${model} cannot be used with the chat/completions endpoint (adapter MockBatchAdapter).` } }));
      }
      if (model.includes("gated")) {
        res.writeHead(403, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { code: 403, message: `${model} is only available on agentic harnesses. Try plugging it into a coding agent or productivity app listed on https://openrouter.ai/apps` } }));
      }
      if (model.includes("overloaded")) {
        res.writeHead(503, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { code: 503, message: "Upstream error from Iota: Service temporarily overloaded", metadata: { error_type: "provider_overloaded" } } }));
      }
      if (model.includes("slowpoke")) await sleep(200_000);

      const usage = { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200, cost: model.includes("free") ? 0 : 0.0012 };
      let content;
      let annotations;
      let toolCall;
      if (web) {
        if ((req.headers.authorization ?? "").includes("freetier")) {
          res.writeHead(402, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: { code: 402, message: "Insufficient credits. Add more using https://openrouter.ai/settings/credits" } }));
        }
        const query = String(payload.messages.at(-1)?.content ?? "");
        content = `Two pages discuss ${query}. Both say plans start around $10 per seat per month; neither confirms a release date.`;
        annotations = citations(query);
      } else if (kind === "json") {
        content = JSON.stringify(fromSchema(payload.response_format.json_schema?.schema));
      } else if (/evidence brief a panel/.test(system)) {
        content =
          "**Key facts**\n- GrokBot plans start around $10 per seat per month [S1].\n- A second page repeats the price [S2] [S99].\n\n" +
          "**Conflicts**\nNone found.\n\n**Not confirmed**\nNo page confirms a product called OpenAI Dots exists. See https://invented.example/brief.";
      } else if (/Reply with ONLY a single JSON object/.test(JSON.stringify(payload.messages))) {
        const last = payload.messages.at(-1).content;
        const schema = JSON.parse(last.slice(last.indexOf("{")));
        content = "Sure! ```json\n" + JSON.stringify(fromSchema(schema)) + "\n```";
      } else {
        const who = (system.match(/You are ([^,.]+)/) ?? [])[1] ?? "a panelist";
        const phase = /OPENING STATEMENT/.test(system) ? "opening" : /CRITIQUE ROUND (\d+)/.test(system) ? `critique ${system.match(/CRITIQUE ROUND (\d+)/)[1]}` : /ADAPTIVE/.test(system) ? "adaptive" : "other";
        const toolResult = (payload.messages ?? []).filter((m) => m.role === "tool").at(-1);
        const found = toolResult ? (JSON.stringify(toolResult.content).match(/S\d+/) ?? [])[0] : null;
        const canSearch = (payload.tools ?? []).some((t) => t.function?.name === "web_search");
        const question = String((payload.messages ?? []).find((m) => m.role === "user")?.content ?? "").slice(0, 200);
        const key = `${model}:${phase}:${question}`;
        if (canSearch && !toolResult && phase === "critique 1" && !toolCallOnce.has(key)) {
          toolCallOnce.add(key);
          toolCall = { id: `call_${toolCallOnce.size}`, type: "function", function: { name: "web_search", arguments: JSON.stringify({ query: `${who} fact check` }) } };
        }
        content = `As ${who} (${model}), in the ${phase} phase: I think we should weigh cost against speed. ` +
          "First, the cheapest path delays launch. Second, the fastest path burns budget. My position: stage it." +
          (/EVIDENCE BRIEF/.test(convo) ? " The brief puts plans at $10 a seat [S1]." : "") +
          (found ? ` My own search found more [${found}].` : "") +
          (/No live web research was available/.test(system) ? " I can't verify current prices for these products." : "");
      }

      if (payload.stream && toolCall) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        res.write(`data: ${JSON.stringify({ id: "gen-1", model, choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, ...toolCall }] } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ id: "gen-1", model, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage })}\n\n`);
        res.write("data: [DONE]\n\n");
        return res.end();
      }
      if (payload.stream) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        const words = content.split(/(?<= )/);
        for (const w of words) {
          res.write(`data: ${JSON.stringify({ id: "gen-1", model, choices: [{ index: 0, delta: { content: w } }] })}\n\n`);
          await sleep(15);
        }
        res.write(`data: ${JSON.stringify({ id: "gen-1", model, choices: [{ index: 0, delta: annotations ? { annotations } : {}, finish_reason: "stop" }], usage })}\n\n`);
        res.write("data: [DONE]\n\n");
        return res.end();
      }
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({
        id: "gen-1", model, object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content, ...(annotations ? { annotations } : {}) }, finish_reason: "stop" }],
        usage,
      }));
    }
    res.writeHead(404);
    res.end();
  })
  .listen(PORT, () => console.log(`mock openrouter on :${PORT}`));
