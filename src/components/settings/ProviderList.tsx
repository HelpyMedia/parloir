"use client";

import { useState } from "react";
import { ProviderForm } from "./ProviderForm";

type Cloud = "openrouter" | "anthropic" | "openai" | "google";
type Local = "ollama" | "lmstudio";

const CLOUD: Array<{ id: Cloud; name: string; hint: string }> = [
  { id: "openrouter", name: "OpenRouter", hint: "Unified gateway to every model. Start here." },
  { id: "anthropic", name: "Anthropic", hint: "Direct API key for Claude models." },
  { id: "openai", name: "OpenAI", hint: "Direct API key for GPT/o1 models." },
  { id: "google", name: "Google AI", hint: "API key for Gemini models." },
];

const LOCAL: Array<{ id: Local; name: string; hint: string; defaultUrl: string }> = [
  { id: "ollama", name: "Ollama", hint: "Run models locally via Ollama.", defaultUrl: "http://localhost:11434" },
  { id: "lmstudio", name: "LM Studio", hint: "OpenAI-compatible local server.", defaultUrl: "http://localhost:1234" },
];

interface Props {
  cloud: Cloud[];
  local: Partial<Record<Local, string>>;
}

export function ProviderList({ cloud, local }: Props) {
  const [cloudSet, setCloudSet] = useState(new Set(cloud));
  const [localSet, setLocalSet] = useState(local);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg text-[var(--color-text-primary)]">Cloud providers</h2>
        <div className="flex flex-col gap-2">
          {CLOUD.map((p) => (
            <ProviderForm
              key={p.id}
              kind="cloud"
              provider={p.id}
              name={p.name}
              hint={p.hint}
              connected={cloudSet.has(p.id)}
              onConnected={() => setCloudSet((s) => new Set(s).add(p.id))}
              onDisconnected={() =>
                setCloudSet((s) => {
                  const n = new Set(s);
                  n.delete(p.id);
                  return n;
                })
              }
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg text-[var(--color-text-primary)]">Local servers</h2>
        <div className="flex flex-col gap-2">
          {LOCAL.map((p) => (
            <ProviderForm
              key={p.id}
              kind="local"
              provider={p.id}
              name={p.name}
              hint={p.hint}
              defaultUrl={p.defaultUrl}
              currentUrl={localSet[p.id] ?? null}
              onConnected={(url) =>
                setLocalSet((s) => ({ ...s, [p.id]: url }))
              }
              onDisconnected={() =>
                setLocalSet((s) => {
                  const n = { ...s };
                  delete n[p.id as Local];
                  return n;
                })
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}
