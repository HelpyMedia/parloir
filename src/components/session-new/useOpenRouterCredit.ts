"use client";

import { useEffect, useState } from "react";

/**
 * Whether the person's OpenRouter account can pay for models: decides the
 * default tier and whether paid tiers are offered. "unknown" when OpenRouter
 * couldn't be asked; paid tiers stay available then, but Free is the default.
 */
export type CreditState = "loading" | "credit" | "none" | "unknown";

export function useOpenRouterCredit(enabled: boolean): CreditState {
  const [state, setState] = useState<CreditState>(enabled ? "loading" : "unknown");
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/credentials/openrouter/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { valid?: boolean | null; freeTier?: boolean | null; limitRemaining?: number | null } | null) => {
        if (cancelled) return;
        if (!s || s.valid !== true || s.freeTier === null || s.freeTier === undefined) return setState("unknown");
        // A free-tier account (never bought credits) or a key with no budget
        // left can only run free models.
        const hasBudget = s.limitRemaining === null || s.limitRemaining === undefined || s.limitRemaining > 0;
        setState(!s.freeTier && hasBudget ? "credit" : "none");
      })
      .catch(() => {
        if (!cancelled) setState("unknown");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return state;
}
