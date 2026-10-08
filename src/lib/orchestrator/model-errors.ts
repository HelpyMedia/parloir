/**
 * Turn a provider/SDK failure into something a person can act on.
 *
 * Raw AI SDK messages ("No output generated. Check the stream for errors.")
 * are meaningless to users. OpenRouter maps most problems to HTTP status
 * codes, so the status is the most reliable signal; message sniffing is a
 * fallback for wrapped errors.
 */

export type ModelErrorCode =
  | "invalid_key"
  | "insufficient_credits"
  | "rate_limited"
  | "model_unavailable"
  | "model_restricted"
  | "provider_overloaded"
  | "context_too_long"
  | "timeout"
  | "empty_response"
  | "unknown";

export interface ModelErrorInfo {
  code: ModelErrorCode;
  message: string;
}

const MESSAGES: Record<ModelErrorCode, string> = {
  invalid_key:
    "The OpenRouter key was rejected. Reconnect OpenRouter in Settings.",
  insufficient_credits:
    "Your OpenRouter account is out of credits for this model. Add credits on openrouter.ai or pick a free model.",
  rate_limited:
    "The model is rate-limited right now. Free models allow a limited number of requests per day; try again later or pick another model.",
  model_unavailable:
    "This model is not available on OpenRouter right now. Pick a different one.",
  model_restricted:
    "OpenRouter won't serve this model to Parloir (some free models are limited to certain apps). Pick a different one.",
  provider_overloaded:
    "The model's provider is overloaded right now. Try again in a few minutes or pick another model.",
  context_too_long:
    "The conversation got too long for this model's context window. Pick a model with a larger context.",
  timeout: "The model took too long to answer and was skipped.",
  empty_response: "The model returned an empty answer.",
  unknown: "The model call failed.",
};

function statusOf(err: unknown): number | null {
  let cur: unknown = err;
  // Walk RetryError.lastError / error.cause chains a few levels deep.
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    const o = cur as Record<string, unknown>;
    if (typeof o.statusCode === "number") return o.statusCode;
    if (typeof o.status === "number") return o.status;
    cur = o.lastError ?? o.cause;
  }
  return null;
}

function textOf(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 4 && cur; i++) {
    if (cur instanceof Error) parts.push(cur.name, cur.message);
    if (cur && typeof cur === "object") {
      const o = cur as Record<string, unknown>;
      if (typeof o.responseBody === "string") parts.push(o.responseBody);
      cur = o.lastError ?? o.cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  return parts.join(" ").toLowerCase();
}

export function describeModelError(err: unknown): ModelErrorInfo {
  const status = statusOf(err);
  const text = textOf(err);

  // OpenRouter also answers 403 for things that have nothing to do with the
  // key (free models gated to partner apps, moderation), so a 403 only means
  // a bad key when the message says so. Misreading it aborts the debate.
  const keyProblem =
    text.includes("invalid api key") ||
    text.includes("no auth credentials") ||
    text.includes("user not found") ||
    text.includes("key is disabled") ||
    text.includes("key has been disabled");

  let code: ModelErrorCode = "unknown";
  if (status === 401 || keyProblem) {
    code = "invalid_key";
  } else if (
    status === 402 ||
    text.includes("insufficient credits") ||
    text.includes("requires more credits") ||
    text.includes("key limit")
  ) {
    code = "insufficient_credits";
  } else if (status === 429 || text.includes("rate limit")) {
    code = "rate_limited";
  } else if (status === 404 || text.includes("no endpoints found") || text.includes("not a valid model")) {
    code = "model_unavailable";
  } else if (status === 403) {
    code = "model_restricted";
  } else if (status === 502 || status === 503 || text.includes("overloaded")) {
    code = "provider_overloaded";
  } else if (text.includes("context length") || text.includes("maximum context") || text.includes("too many tokens")) {
    code = "context_too_long";
  } else if (text.includes("timeouterror") || text.includes("aborterror") || text.includes("timed out") || text.includes("aborted")) {
    code = "timeout";
  } else if (text.includes("no output generated") || text.includes("empty")) {
    code = "empty_response";
  }

  return { code, message: MESSAGES[code] };
}

/**
 * Errors that hit every participant the same way — no point continuing.
 * Out-of-credits is NOT account-wide: free models keep working at zero balance.
 */
export function isAccountWideError(code: ModelErrorCode): boolean {
  return code === "invalid_key";
}

/** Thrown when the debate cannot continue; message is safe to show users. */
export class DebateAbortedError extends Error {
  constructor(
    message: string,
    readonly code: ModelErrorCode | "not_enough_participants" | "synthesis_failed",
  ) {
    super(message);
    this.name = "DebateAbortedError";
  }
}
