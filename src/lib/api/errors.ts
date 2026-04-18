/**
 * Server-error response helpers.
 *
 * Never return raw exception `message` text to clients — the original
 * message can leak query shape, connection strings, internal hostnames,
 * file paths. Log the detail, reply with a generic code.
 */

import { NextResponse } from "next/server";

export function respondServerError(
  context: string,
  err: unknown,
  status = 500,
): NextResponse {
  // eslint-disable-next-line no-console
  console.error(`[${context}]`, err);
  return NextResponse.json(
    { error: "internal_error" },
    { status },
  );
}
