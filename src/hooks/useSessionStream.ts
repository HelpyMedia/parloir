"use client";

import { useEffect, useReducer, useRef } from "react";
import type { StreamEvent } from "@/lib/orchestrator/types";
import { applyEvent, initialState } from "@/lib/session-ui/reducer";
import type { HydrationBundle, UISession } from "@/lib/session-ui/types";

type Action =
  | { type: "event"; event: StreamEvent; seq: number }
  | { type: "error"; message: string };

function reducer(state: UISession, action: Action): UISession {
  switch (action.type) {
    case "event": {
      // Every event carries its seq; anything at or below what we've applied
      // is a replay from a reconnect and must not be applied twice.
      if (action.seq <= state.lastSeq) return state;
      const next = applyEvent(state, action.event);
      return { ...next, lastSeq: action.seq };
    }
    case "error":
      return { ...state, error: action.message };
  }
}

export function useSessionStream(bundle: HydrationBundle): UISession {
  const [state, dispatch] = useReducer(reducer, bundle, initialState);
  const lastSeqRef = useRef(state.lastSeq);
  lastSeqRef.current = state.lastSeq;

  const terminal = state.phase === "completed" || state.phase === "failed";

  useEffect(() => {
    if (terminal) return;
    const sessionId = bundle.session.id;

    // One connection for the life of the page. EventSource reconnects on its
    // own and sends Last-Event-ID, so the server resumes after the last seq.
    const source = new EventSource(`/api/sessions/${sessionId}/stream?lastSeq=${lastSeqRef.current}`);

    source.addEventListener("turn", (e) => {
      try {
        const msg = JSON.parse((e as MessageEvent).data) as { seq: number; event: StreamEvent };
        dispatch({ type: "event", event: msg.event, seq: msg.seq });
      } catch {
        /* malformed frame — ignore; the next frame will carry on */
      }
    });

    source.addEventListener("error", (e) => {
      const data = (e as MessageEvent).data;
      if (!data) return; // network blip: EventSource reconnects by itself
      try {
        dispatch({ type: "error", message: (JSON.parse(data) as { message: string }).message });
      } catch {
        /* ignore */
      }
    });

    source.addEventListener("done", () => source.close());

    return () => source.close();
  }, [bundle.session.id, terminal]);

  return state;
}
