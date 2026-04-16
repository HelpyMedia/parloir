"use client";

import { useEffect, useReducer, useRef } from "react";
import type { StreamEvent } from "@/lib/orchestrator/types";
import { applyEvent, initialState } from "@/lib/session-ui/reducer";
import type { HydrationBundle, UISession } from "@/lib/session-ui/types";

type Action =
  | { type: "event"; event: StreamEvent; seq: number }
  | { type: "error"; message: string }
  | { type: "seq"; seq: number };

function reducer(state: UISession, action: Action): UISession {
  switch (action.type) {
    case "event": {
      const next = applyEvent(state, action.event);
      return { ...next, lastSeq: action.seq };
    }
    case "error":
      return { ...state, error: action.message };
    case "seq":
      return { ...state, lastSeq: action.seq };
  }
}

export function useSessionStream(bundle: HydrationBundle): UISession {
  const [state, dispatch] = useReducer(reducer, bundle, initialState);
  const lastSeqRef = useRef(state.lastSeq);
  lastSeqRef.current = state.lastSeq;

  useEffect(() => {
    const sessionId = bundle.session.id;
    const terminal = state.phase === "completed" || state.phase === "failed";
    if (terminal) return;

    const url = `/api/sessions/${sessionId}/stream?lastSeq=${lastSeqRef.current}`;
    const source = new EventSource(url);

    source.addEventListener("turn", (e) => {
      try {
        const msg = JSON.parse((e as MessageEvent).data) as {
          seq: number;
          event: StreamEvent;
        };
        dispatch({ type: "event", event: msg.event, seq: msg.seq });
      } catch (err) {
        dispatch({ type: "error", message: `Failed to parse event: ${String(err)}` });
      }
    });

    source.addEventListener("error", (e) => {
      const msg = (e as MessageEvent).data;
      if (msg) {
        try {
          const parsed = JSON.parse(msg);
          dispatch({ type: "error", message: parsed.message });
        } catch {
          /* swallow — EventSource will auto-reconnect */
        }
      }
    });

    source.addEventListener("done", () => {
      source.close();
    });

    return () => source.close();
  }, [bundle.session.id, state.phase]);

  return state;
}
