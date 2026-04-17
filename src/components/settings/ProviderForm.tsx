"use client";

import { useState } from "react";

type Kind = "cloud" | "local";

interface Props {
  kind: Kind;
  provider: string;
  name: string;
  hint: string;
  connected?: boolean;
  currentUrl?: string | null;
  defaultUrl?: string;
  onConnected: (value: string) => void;
  onDisconnected: () => void;
}

export function ProviderForm({
  kind,
  provider,
  name,
  hint,
  connected,
  currentUrl,
  defaultUrl,
  onConnected,
  onDisconnected,
}: Props) {
  const isConnected = kind === "cloud" ? !!connected : !!currentUrl;
  const [editing, setEditing] = useState(!isConnected);
  const [value, setValue] = useState(kind === "local" ? (currentUrl ?? defaultUrl ?? "") : "");
  const [testResult, setTestResult] = useState<{ ok: boolean; detail?: string } | null>(null);
  const [busy, setBusy] = useState<"none" | "test" | "save" | "delete">("none");
  const [error, setError] = useState<string | null>(null);

  async function handleTest() {
    setBusy("test");
    setError(null);
    setTestResult(null);
    try {
      const body = kind === "cloud" ? { apiKey: value } : { baseUrl: value };
      const r = await fetch(`/api/credentials/${provider}/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      setTestResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("none");
    }
  }

  async function handleSave() {
    setBusy("save");
    setError(null);
    try {
      const body =
        kind === "cloud"
          ? { kind, provider, apiKey: value }
          : { kind, provider, baseUrl: value };
      const r = await fetch(`/api/credentials`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error ? JSON.stringify(data.error) : `HTTP ${r.status}`);
      }
      onConnected(value);
      setEditing(false);
      if (kind === "cloud") setValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("none");
    }
  }

  async function handleDelete() {
    setBusy("delete");
    setError(null);
    try {
      const r = await fetch(`/api/credentials/${provider}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      onDisconnected();
      setValue("");
      setEditing(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("none");
    }
  }

  const borderClass = isConnected
    ? "border-[var(--color-spot-warm)]"
    : "border-[var(--color-border-subtle)]";

  return (
    <div className={`rounded-lg border ${borderClass} bg-[var(--color-surface-card)] p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-base text-[var(--color-text-primary)]">
            {name}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">{hint}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-[10px] uppercase tracking-wide"
            style={{
              color: isConnected
                ? "var(--color-consensus)"
                : "var(--color-text-dim)",
            }}
          >
            {isConnected ? "Connected" : "Not connected"}
          </span>
          {isConnected && !editing && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded border border-[var(--color-border-subtle)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-spot-warm)] hover:text-[var(--color-spot-warm)]"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy !== "none"}
                className="rounded border border-[var(--color-border-subtle)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] disabled:opacity-50"
              >
                {busy === "delete" ? "…" : "Disconnect"}
              </button>
            </>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-3 flex flex-col gap-2">
          <input
            type={kind === "cloud" ? "password" : "url"}
            autoComplete="off"
            placeholder={
              kind === "cloud" ? `${name} API key` : defaultUrl ?? "Base URL"
            }
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setTestResult(null);
            }}
            className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-3 py-2 font-mono text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-spot-warm)]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={busy !== "none" || !value.trim()}
              className="rounded border border-[var(--color-border-subtle)] px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-spot-warm)] hover:text-[var(--color-spot-warm)] disabled:opacity-50"
            >
              {busy === "test" ? "Testing…" : "Test"}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy !== "none" || !value.trim()}
              className="rounded bg-[var(--color-spot-warm)] px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-[var(--color-bg-chamber)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy === "save" ? "Saving…" : "Save"}
            </button>
            {isConnected && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setValue(kind === "local" ? (currentUrl ?? defaultUrl ?? "") : "");
                  setTestResult(null);
                  setError(null);
                }}
                className="rounded px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text-muted)]"
              >
                Cancel
              </button>
            )}
            {testResult && (
              <span
                className="font-mono text-[11px]"
                style={{
                  color: testResult.ok
                    ? "var(--color-consensus)"
                    : "var(--color-danger)",
                }}
              >
                {testResult.ok ? "✓ OK" : `✗ ${testResult.detail ?? "failed"}`}
              </span>
            )}
          </div>
          {error && (
            <span className="font-mono text-xs text-[var(--color-danger)]">
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
