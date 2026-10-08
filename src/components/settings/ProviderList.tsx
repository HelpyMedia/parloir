"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { OpenRouterCard } from "./OpenRouterCard";
import { ProviderForm } from "./ProviderForm";

type Cloud = "openrouter" | "anthropic" | "openai" | "google";
type Local = "ollama" | "lmstudio";

const DIRECT: Array<{ id: Exclude<Cloud, "openrouter">; name: string; hint: string }> = [
  { id: "anthropic", name: "Anthropic", hint: "anthropicHint" },
  { id: "openai", name: "OpenAI", hint: "openaiHint" },
  { id: "google", name: "Google AI", hint: "googleHint" },
];

const LOCAL: Array<{ id: Local; name: string; hint: string; defaultUrl: string }> = [
  { id: "ollama", name: "Ollama", hint: "ollamaHint", defaultUrl: "http://localhost:11434" },
  { id: "lmstudio", name: "LM Studio", hint: "lmstudioHint", defaultUrl: "http://localhost:1234" },
];

interface Props {
  cloud: Cloud[];
  local: Partial<Record<Local, string>>;
  /** Hosted edition: OpenRouter only. */
  hosted: boolean;
}

export function ProviderList({ cloud, local, hosted }: Props) {
  const t = useTranslations("Settings");
  const [cloudSet, setCloudSet] = useState(new Set(cloud));
  const [localSet, setLocalSet] = useState(local);

  const setCloud = (id: Cloud, on: boolean) =>
    setCloudSet((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  return (
    <div className="flex flex-col gap-6">
      <OpenRouterCard
        connected={cloudSet.has("openrouter")}
        onChange={(on) => setCloud("openrouter", on)}
      />

      <p className="text-xs text-[var(--color-text-dim)]">{t("privacy")}</p>

      {!hosted && (
        <>
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-lg text-[var(--color-text-primary)]">{t("otherProviders")}</h2>
              <p className="text-xs text-[var(--color-text-muted)]">{t("otherHint")}</p>
            </div>
            <div className="flex flex-col gap-2">
              {DIRECT.map((p) => (
                <ProviderForm
                  key={p.id}
                  kind="cloud"
                  provider={p.id}
                  name={p.name}
                  hint={t(p.hint)}
                  connected={cloudSet.has(p.id)}
                  onConnected={() => setCloud(p.id, true)}
                  onDisconnected={() => setCloud(p.id, false)}
                />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-lg text-[var(--color-text-primary)]">{t("localServers")}</h2>
            <div className="flex flex-col gap-2">
              {LOCAL.map((p) => (
                <ProviderForm
                  key={p.id}
                  kind="local"
                  provider={p.id}
                  name={p.name}
                  hint={t(p.hint)}
                  defaultUrl={p.defaultUrl}
                  currentUrl={localSet[p.id] ?? null}
                  onConnected={(url) => setLocalSet((s) => ({ ...s, [p.id]: url }))}
                  onDisconnected={() =>
                    setLocalSet((s) => {
                      const n = { ...s };
                      delete n[p.id];
                      return n;
                    })
                  }
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
