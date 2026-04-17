import Link from "next/link";

export function LocalOnlyReliabilityNote() {
  return (
    <div className="rounded-lg border border-[var(--color-spot-warm)]/40 bg-[var(--color-spot-halo)]/30 p-3 text-xs text-[var(--color-text-muted)]">
      <div className="mb-1 font-mono uppercase tracking-wide text-[var(--color-spot-warm)]">
        Heads up — local only
      </div>
      <p>
        Consensus and synthesis need a model that reliably produces structured
        JSON. Small local models (e.g. Llama 3.2 3B) often can&apos;t. If your
        session stalls on those phases, either use a capable local model
        (Qwen 2.5 7B+ is a good starting point) or{" "}
        <Link href="/settings" className="underline">
          connect a cloud provider
        </Link>{" "}
        (Anthropic, OpenAI, Google, or OpenRouter) — the orchestrator will
        use it automatically as fallback.
      </p>
    </div>
  );
}
