// Local stand-in for OpenRouter, for running full debates without spending
// anything or needing network access. Start it, then set
//   PARLOIR_OPENROUTER_BASE_URL=http://localhost:4010/api/v1
// in .env.local and save any string as your OpenRouter key in Settings.
//
// - GET  /api/v1/models            small catalog (free + paid, benchmarks)
// - POST /api/v1/chat/completions  streaming or JSON; json_schema honored
// Model ids containing "broken" return 429 (exercise skipped turns);
// "gated" return OpenRouter's 403 for free models limited to partner apps;
// "overloaded" return 503; "slowpoke" hangs 200s (exercise timeouts).
// GET /api/v1/key reports a free-tier account when the key contains
// "freetier", otherwise a paid one with $25 left.
import http from "node:http";

const PORT = Number(process.env.PORT ?? 4010);
const now = Math.floor(Date.now() / 1000);

const models = [
  ["mocklab/genius-pro", "MockLab: Genius Pro", "0.000003", "0.000015", 60, ["structured_outputs", "response_format"]],
  ["alpha/thinker-7", "Alpha: Thinker 7", "0.000001", "0.000004", 50, ["response_format"]],
  ["beta/chat-large:free", "Beta: Chat Large (free)", "0", "0", 45, []],
  ["gamma/reasoner:free", "Gamma: Reasoner (free)", "0", "0", 40, ["structured_outputs"]],
  ["delta/mini:free", "Delta: Mini (free)", "0", "0", null, []],
  ["epsilon/broken:free", "Epsilon: Broken (free)", "0", "0", 30, []],
  ["theta/gated:free", "Theta: Gated (free)", "0", "0", 55, []],
  ["kappa/value-chat", "Kappa: Value Chat", "0.0000002", "0.0000008", 42, ["response_format"]],
  ["lambda/budget", "Lambda: Budget", "0.0000005", "0.000002", 38, ["structured_outputs"]],
  ["mu/mid-pro", "Mu: Mid Pro", "0.0000015", "0.000008", 58, ["structured_outputs"]],
  ["nu/frontier-max", "Nu: Frontier Max", "0.00001", "0.00004", 70, ["structured_outputs"]],
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

function fromSchema(schema, path = "") {
  if (!schema) return null;
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
      if (path.endsWith("decision")) return "Adopt option B with a staged rollout.";
      return `mock ${path.split(".").pop()}`;
    default:
      return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const calls = [];

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
      calls.push({ model, kind, at: Date.now(), auth: req.headers.authorization?.slice(0, 12), title: req.headers["x-title"] });

      if (model.includes("broken")) {
        res.writeHead(429, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { code: 429, message: "Rate limit exceeded: free-models-per-day" } }));
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
      if (kind === "json") {
        content = JSON.stringify(fromSchema(payload.response_format.json_schema?.schema));
      } else if (/Reply with ONLY a single JSON object/.test(JSON.stringify(payload.messages))) {
        const last = payload.messages.at(-1).content;
        const schema = JSON.parse(last.slice(last.indexOf("{")));
        content = "Sure! ```json\n" + JSON.stringify(fromSchema(schema)) + "\n```";
      } else {
        const who = (system.match(/You are ([^,.]+)/) ?? [])[1] ?? "a panelist";
        const phase = /OPENING STATEMENT/.test(system) ? "opening" : /CRITIQUE ROUND (\d+)/.test(system) ? `critique ${system.match(/CRITIQUE ROUND (\d+)/)[1]}` : /ADAPTIVE/.test(system) ? "adaptive" : "other";
        content = `As ${who} (${model}), in the ${phase} phase: I think we should weigh cost against speed. ` +
          "First, the cheapest path delays launch. Second, the fastest path burns budget. My position: stage it.";
      }

      if (payload.stream) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        const words = content.split(/(?<= )/);
        for (const w of words) {
          res.write(`data: ${JSON.stringify({ id: "gen-1", model, choices: [{ index: 0, delta: { content: w } }] })}\n\n`);
          await sleep(15);
        }
        res.write(`data: ${JSON.stringify({ id: "gen-1", model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage })}\n\n`);
        res.write("data: [DONE]\n\n");
        return res.end();
      }
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({
        id: "gen-1", model, object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
        usage,
      }));
    }
    res.writeHead(404);
    res.end();
  })
  .listen(PORT, () => console.log(`mock openrouter on :${PORT}`));
