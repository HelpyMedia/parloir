import Link from "next/link";
import { NewSessionForm } from "@/components/session-new/NewSessionForm";
import { listTemplatePersonas } from "@/lib/personas";
import { requireUser } from "@/lib/auth/server";
import { listConnectedProviders, listLocalUrls } from "@/lib/credentials/service";

export const dynamic = "force-dynamic";

export default async function NewSessionPage() {
  const user = await requireUser();
  const [personas, cloud, local] = await Promise.all([
    listTemplatePersonas(),
    listConnectedProviders(user.id),
    listLocalUrls(user.id),
  ]);
  const hasAny = cloud.length > 0 || Object.values(local).some(Boolean);

  if (!hasAny) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--color-spot-warm)]">
            One more step
          </span>
          <h1 className="font-display text-2xl text-[var(--color-text-primary)]">
            Connect a provider to start a session
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Parloir runs debates on models you bring yourself — an API key
            (OpenRouter, Anthropic, OpenAI, Google) or a local server (Ollama,
            LM Studio).
          </p>
        </div>
        <Link
          href="/settings"
          className="rounded bg-[var(--color-spot-warm)] px-4 py-2 font-mono text-xs uppercase tracking-wide text-[var(--color-bg-chamber)] transition-opacity hover:opacity-90"
        >
          Open settings →
        </Link>
      </main>
    );
  }

  return <NewSessionForm personas={personas} />;
}
