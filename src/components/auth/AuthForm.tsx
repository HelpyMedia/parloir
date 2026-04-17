"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";

interface AuthFormProps {
  mode: "signin" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/sessions/new";

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
          setError(result.error.message ?? "Sign up failed.");
        } else {
          window.location.href = next;
        }
      } else {
        const result = await authClient.signIn.email({
          email,
          password,
        });
        if (result.error) {
          setError(result.error.message ?? "Sign in failed.");
        } else {
          window.location.href = next;
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
      {/* Heading */}
      <h1
        className="font-display text-2xl mb-6"
        style={{ color: "var(--color-text-primary)" }}
      >
        {isSignUp ? "Create account" : "Sign in"}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Name field — signup only */}
        {isSignUp && (
          <div className="space-y-1.5">
            <label
              htmlFor="name"
              className="block font-mono text-[11px] uppercase tracking-[0.18em]"
              style={{ color: "var(--color-text-dim)" }}
            >
              Name
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

        {/* Email field */}
        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="block font-mono text-[11px] uppercase tracking-[0.18em]"
            style={{ color: "var(--color-text-dim)" }}
          >
            Email
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

        {/* Password field */}
        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block font-mono text-[11px] uppercase tracking-[0.18em]"
            style={{ color: "var(--color-text-dim)" }}
          >
            Password
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

        {/* Error message */}
        {error && (
          <p
            className="text-sm font-mono"
            role="alert"
            style={{ color: "var(--color-danger)" }}
          >
            {error}
          </p>
        )}

        {/* Submit button */}
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
              ? "Creating…"
              : "Signing in…"
            : isSignUp
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      {/* Toggle link */}
      <p
        className="mt-6 text-center text-sm"
        style={{ color: "var(--color-text-muted)" }}
      >
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link
              href="/signin"
              className="transition-colors hover:underline"
              style={{ color: "var(--color-spot-warm)" }}
            >
              Sign in
            </Link>
          </>
        ) : (
          <>
            Need an account?{" "}
            <Link
              href="/signup"
              className="transition-colors hover:underline"
              style={{ color: "var(--color-spot-warm)" }}
            >
              Sign up
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
