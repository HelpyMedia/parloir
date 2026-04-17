"use client";

import { useEffect, useState } from "react";

interface ProviderModel {
  id: string;
  label: string;
}

function providerOf(modelId: string): string {
  const first = modelId.split("/")[0];
  return first === "google-gemini" ? "google" : first;
}

interface Props {
  personaId: string;
  defaultModel: string;
  override: string | undefined;
  onChange: (modelId: string) => void;
}

export function ModelPickerInline({ personaId, defaultModel, override, onChange }: Props) {
  const provider = providerOf(defaultModel);
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
        if (!cancelled) setModels(data.models ?? []);
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

  const current = override ?? defaultModel;

  if (loading && !models) {
    return (
      <span className="font-mono text-[10px] text-[var(--color-text-dim)]">
        Loading models…
      </span>
    );
  }
  if (error) {
    // 409 "provider not connected" gets a settings link; other errors show raw message
    const isNotConnected = error.toLowerCase().includes("not connected");
    return (
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
    );
  }

  const options = models ?? [{ id: defaultModel, label: defaultModel }];
  const hasDefault = options.some((o) => o.id === defaultModel);
  const fullOptions = hasDefault
    ? options
    : [{ id: defaultModel, label: defaultModel }, ...options];

  return (
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
  );
}
