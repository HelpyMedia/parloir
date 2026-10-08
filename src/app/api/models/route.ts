/**
 * GET /api/models — the live OpenRouter catalog, trimmed for the picker,
 * plus suggested default panels (all models / free only).
 *
 * The catalog is public data; we still require a signed-in user so this
 * route can't be used as an anonymous proxy.
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { pickDefaultPanel } from "@/lib/providers/openrouter-catalog";
import { getCatalogWithHealth } from "@/lib/models/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireUser();
  try {
    const catalog = await getCatalogWithHealth();
    return NextResponse.json(
      {
        models: catalog,
        defaults: {
          free: pickDefaultPanel(catalog, 5, { freeOnly: true }),
          all: pickDefaultPanel(catalog, 5, { freeOnly: false }),
        },
      },
      { headers: { "Cache-Control": "private, max-age=120" } },
    );
  } catch (err) {
    console.error("[api/models] catalog unavailable", err);
    return NextResponse.json({ error: "catalog_unavailable" }, { status: 503 });
  }
}
