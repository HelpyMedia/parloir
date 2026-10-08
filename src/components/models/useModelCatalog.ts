"use client";

import { useEffect, useState } from "react";
import type { CatalogModel } from "@/lib/providers/openrouter-catalog";

/** A model as the picker shows it, whatever provider it comes from. */
export interface PickerModel {
  id: string;
  name: string;
  provider: string;
  author: string;
  isFree: boolean;
  promptPerM: number | null;
  completionPerM: number | null;
  contextLength: number | null;
  intelligence: number | null;
  created: number;
}

export interface ModelCatalogState {
  models: PickerModel[];
  defaults: { free: string[]; all: string[] };
  loading: boolean;
  error: string | null;
}

const EMPTY: ModelCatalogState = {
  models: [],
  defaults: { free: [], all: [] },
  loading: true,
  error: null,
};

// One fetch per page load, shared by every picker on the page.
let shared: Promise<ModelCatalogState> | null = null;

function fromCatalog(m: CatalogModel): PickerModel {
  return {
    id: m.id,
    name: m.name,
    provider: "openrouter",
    author: m.author,
    isFree: m.isFree,
    promptPerM: m.promptPerM,
    completionPerM: m.completionPerM,
    contextLength: m.contextLength,
    intelligence: m.intelligence,
    created: m.created,
  };
}

async function load(providers: string[]): Promise<ModelCatalogState> {
  const models: PickerModel[] = [];
  let defaults = { free: [] as string[], all: [] as string[] };
  let error: string | null = null;

  if (providers.includes("openrouter")) {
    try {
      const r = await fetch("/api/models");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as {
        models: CatalogModel[];
        defaults: { free: string[]; all: string[] };
      };
      models.push(...body.models.map(fromCatalog));
      defaults = body.defaults;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  // Self-hosted extras: direct providers and local servers.
  for (const provider of providers.filter((p) => p !== "openrouter")) {
    try {
      const r = await fetch(`/api/providers/${provider}/models`);
      if (!r.ok) continue;
      const body = (await r.json()) as { models?: Array<{ id: string; label: string }> };
      for (const m of body.models ?? []) {
        models.push({
          id: m.id,
          name: m.label,
          provider,
          author: provider,
          isFree: provider === "ollama" || provider === "lmstudio",
          promptPerM: null,
          completionPerM: null,
          contextLength: null,
          intelligence: null,
          created: 0,
        });
      }
    } catch {
      /* a provider that can't list models just contributes nothing */
    }
  }

  if (!providers.includes("openrouter") && models.length > 0) {
    defaults = { free: models.map((m) => m.id), all: models.map((m) => m.id) };
  }

  return { models, defaults, loading: false, error };
}

export function useModelCatalog(providers: string[]): ModelCatalogState {
  const [state, setState] = useState<ModelCatalogState>(EMPTY);
  const key = providers.join(",");

  useEffect(() => {
    let cancelled = false;
    shared ??= load(key.split(",").filter(Boolean));
    void shared.then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return state;
}

export function formatPrice(perM: number | null): string {
  if (perM === null) return "—";
  if (perM === 0) return "$0";
  return perM < 1 ? `$${perM.toFixed(2)}` : `$${perM.toFixed(perM < 10 ? 2 : 0)}`;
}

export function formatContext(tokens: number | null): string {
  if (!tokens) return "—";
  return tokens >= 1_000_000 ? `${Math.round(tokens / 100_000) / 10}M` : `${Math.round(tokens / 1000)}K`;
}
