/**
 * Durable step runner — the seam between the orchestrator and whatever
 * executes it.
 *
 * Inngest replays a function from the top every time one of its steps
 * completes, returning memoized results for steps that already ran. Any
 * side effect that is NOT inside a step (an LLM call, a DB write, a stream
 * event) therefore runs again on every replay. Before this seam existed the
 * whole debate ran outside any step, so resuming after a pause re-ran every
 * model call made before it.
 *
 * Rules for orchestrator code:
 *   - Every side effect goes inside `durable.step(id, fn)`.
 *   - Step IDs must be deterministic: derive them from loop indexes and
 *     phase names, never from DB state or timestamps.
 *   - Step results are JSON-serialized by Inngest, so Dates come back as
 *     strings. Return plain data and re-hydrate where needed.
 */

export interface Durable {
  step<T>(id: string, fn: () => Promise<T>): Promise<T>;
}

/** Runs steps immediately. For scripts, tests and the inline control plane. */
export const inlineDurable: Durable = {
  step: (_id, fn) => fn(),
};
