"use client";

import { useEffect, useState } from "react";

interface ProviderModel {
  id: string;
  label: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  ollama: "Ollama",
  lmstudio: "LM Studio",
};

function providerOf(modelId: string): string {
  const first = modelId.split("/")[0];
  return first === "google-gemini" ? "google" : first;
}

interface Props {
  personaId: string;
  defaultModel: string;
  override: string | undefined;
  connectedProviders: string[];
  onChange: (modelId: string) => void;
}

export function ModelPickerInline({
  personaId,
  defaultModel,
  override,
  connectedProviders,
  onChange,
}: Props) {
  const current = override ?? defaultModel;
  const currentProvider = providerOf(current);

  // If the persona's default (or current override) provider is connected, use
  // it; otherwise fall back to the first connected provider so the picker
  // surfaces something the user can actually pick.
  const initialProvider = connectedProviders.includes(currentProvider)
    ? currentProvider
    : connectedProviders[0] ?? currentProvider;

  const [provider, setProvider] = useState(initialProvider);
  const [models, setModels] = useState<ProviderModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/providers/${provider}/models`);
        const data = (await r.json()) as { models?: ProviderModel[]; error?: string };
        if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
        if (cancelled) return;
        const list = data.models ?? [];
        setModels(list);
        // If the form's current model belongs to a different provider than the
        // one the user is browsing, snap to this provider's first model so the
        // selection stays coherent.
        if (list.length > 0 && providerOf(current) !== provider) {
          onChange(list[0].id);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, personaId]);

  const providerSelect = connectedProviders.length > 1 && (
    <select
      value={provider}
      onChange={(e) => setProvider(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-2 py-1 font-mono text-[10px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-spot-warm)]"
    >
      {connectedProviders.map((p) => (
        <option key={p} value={p}>
          {PROVIDER_LABELS[p] ?? p}
        </option>
      ))}
    </select>
  );

  if (loading && !models) {
    return (
      <div className="flex flex-col gap-1">
        {providerSelect}
        <span className="font-mono text-[10px] text-[var(--color-text-dim)]">
          Loading models…
        </span>
      </div>
    );
  }
  if (error) {
    const isNotConnected = error.toLowerCase().includes("not connected");
    return (
      <div className="flex flex-col gap-1">
        {providerSelect}
        <div className="font-mono text-[10px] text-[var(--color-danger)]">
          {isNotConnected ? (
            <>
              No provider connected for {provider}.{" "}
              <a
                href="/settings"
                className="underline"
                onClick={(e) => e.stopPropagation()}
              >
                Go to Settings
              </a>
              .
            </>
          ) : (
            error
          )}
        </div>
      </div>
    );
  }

  const options = models ?? [];
  const hasCurrent = options.some((o) => o.id === current);
  const fullOptions =
    hasCurrent || options.length === 0
      ? options.length === 0
        ? [{ id: current, label: current }]
        : options
      : [{ id: current, label: current }, ...options];

  return (
    <div className="flex flex-col gap-1">
      {providerSelect}
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-2 py-1 font-mono text-[10px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-spot-warm)]"
      >
        {fullOptions.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}
