"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";

interface AuthFormProps {
  mode: "signin" | "signup";
}

/**
 * Only accept same-origin paths that start with a single `/`. This prevents
 * attacker-controlled `?next=https://evil.tld` or `?next=//evil.tld` values.
 * We also strip any locale prefix because `router.push` re-adds the current
 * locale — if the attacker's path is `/en/evil` it still starts with `/`, but
 * router.push treats `/evil` and `/en/evil` identically under the locale
 * segment, so the final URL stays on our origin.
 */
function sanitizeNext(raw: string | null): string {
  if (!raw) return "/sessions";
  if (!raw.startsWith("/")) return "/sessions";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/sessions";
  return raw;
}

export function AuthForm({ mode }: AuthFormProps) {
  const t = useTranslations("Auth");
  const searchParams = useSearchParams();
  const next = sanitizeNext(searchParams.get("next"));
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isSignUp = mode === "signup";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      if (isSignUp) {
        const result = await authClient.signUp.email({
          email,
          password,
          name,
        });
        if (result.error) {
          setError(result.error.message ?? t("signUpFailed"));
        } else {
          router.push(next);
          router.refresh();
        }
      } else {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) {
          setError(result.error.message ?? t("signInFailed"));
        } else {
          router.push(next);
          router.refresh();
        }
      }
    });
  }

  return (
    <div
      className="w-full max-w-sm rounded-lg border p-8"
      style={{
        backgroundColor: "var(--color-surface-card)",
        borderColor: "var(--color-border-subtle)",
      }}
    >
      <h1
        className="font-display text-2xl mb-6"
        style={{ color: "var(--color-text-primary)" }}
      >
        {isSignUp ? t("signUpTitle") : t("signInTitle")}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {isSignUp && (
          <div className="space-y-1.5">
            <label
              htmlFor="name"
              className="block font-mono text-[11px] uppercase tracking-[0.18em]"
              style={{ color: "var(--color-text-dim)" }}
            >
              {t("nameLabel")}
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors"
              style={{
                backgroundColor: "var(--color-surface-raised)",
                borderColor: "var(--color-border-subtle)",
                color: "var(--color-text-primary)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-spot-warm)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-subtle)";
              }}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="block font-mono text-[11px] uppercase tracking-[0.18em]"
            style={{ color: "var(--color-text-dim)" }}
          >
            {t("emailLabel")}
          </label>
          <input
            id="email"
            type="email"
            autoComplete={isSignUp ? "email" : "username"}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors"
            style={{
              backgroundColor: "var(--color-surface-raised)",
              borderColor: "var(--color-border-subtle)",
              color: "var(--color-text-primary)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--color-spot-warm)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-subtle)";
            }}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block font-mono text-[11px] uppercase tracking-[0.18em]"
            style={{ color: "var(--color-text-dim)" }}
          >
            {t("passwordLabel")}
          </label>
          <input
            id="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors"
            style={{
              backgroundColor: "var(--color-surface-raised)",
              borderColor: "var(--color-border-subtle)",
              color: "var(--color-text-primary)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--color-spot-warm)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-subtle)";
            }}
          />
        </div>

        {error && (
          <p
            className="text-sm font-mono"
            role="alert"
            style={{ color: "var(--color-danger)" }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md px-4 py-2.5 text-sm font-mono uppercase tracking-[0.12em] transition-opacity disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          style={{
            backgroundColor: "var(--color-spot-warm)",
            color: "var(--color-bg-chamber)",
          }}
        >
          {isPending
            ? isSignUp
              ? t("signUpPending")
              : t("signInPending")
            : isSignUp
              ? t("signUpSubmit")
              : t("signInSubmit")}
        </button>
      </form>

      <p
        className="mt-6 text-center text-sm"
        style={{ color: "var(--color-text-muted)" }}
      >
        {isSignUp ? (
          <>
            {t("alreadyHaveAccount")}{" "}
            <Link
              href="/signin"
              className="transition-colors hover:underline"
              style={{ color: "var(--color-spot-warm)" }}
            >
              {t("signInLink")}
            </Link>
          </>
        ) : (
          <>
            {t("needAccount")}{" "}
            <Link
              href="/signup"
              className="transition-colors hover:underline"
              style={{ color: "var(--color-spot-warm)" }}
            >
              {t("signUpLink")}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
