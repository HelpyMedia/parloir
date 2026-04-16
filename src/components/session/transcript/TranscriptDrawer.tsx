"use client";

import { useEffect, useRef } from "react";
import type { ConsensusReport, Persona, Phase, Turn } from "@/lib/orchestrator/types";
import type { LiveTurn } from "@/lib/session-ui/types";
import { ConsensusCard } from "./ConsensusCard";
import { PhaseDivider } from "./PhaseDivider";
import { TurnCard } from "./TurnCard";

interface Props {
  turns: Turn[];
  live: LiveTurn | null;
  consensusReports: ConsensusReport[];
  personas: Persona[];
}

export function TranscriptDrawer({ turns, live, consensusReports, personas }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoFollow = useRef(true);

  useEffect(() => {
    if (!autoFollow.current || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns.length, live?.text.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    autoFollow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  const jumpToTurn = (id: string) => {
    const node = document.getElementById(`turn-${id}`);
    if (node && scrollRef.current) {
      autoFollow.current = false;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const rendered = interleave(turns, consensusReports);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-6 py-4 pb-24"
      role="log"
      aria-label="Debate transcript"
    >
      <div className="mx-auto flex max-w-[960px] flex-col gap-3">
        {rendered.map((node, i) => (
          <div key={i}>{renderItem(node, jumpToTurn)}</div>
        ))}
        {live && <LiveTurnCard live={live} personas={personas} />}
      </div>
    </div>
  );
}

function LiveTurnCard({ live, personas }: { live: LiveTurn; personas: Persona[] }) {
  const persona = personas.find((p) => p.id === live.speakerId);
  const turn: Turn = {
    id: "live",
    sessionId: "",
    phase: live.phase,
    roundNumber: 0,
    turnIndex: 0,
    speakerRole: "agent",
    speakerId: live.speakerId,
    speakerName: persona?.name ?? live.speakerName,
    content: live.text || "…",
    toolCalls: live.toolCalls,
    references: [],
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    model: persona?.model ?? "",
    createdAt: new Date(),
  };
  return <TurnCard turn={turn} live />;
}

type Item =
  | { kind: "divider"; phase: Phase; round: number; key: string }
  | { kind: "turn"; turn: Turn }
  | { kind: "consensus"; report: ConsensusReport; round: number };

function interleave(turns: Turn[], reports: ConsensusReport[]): Item[] {
  const items: Item[] = [];
  let currentKey: string | null = null;
  const emittedConsensusRounds = new Set<number>();

  for (const turn of turns) {
    const key = `${turn.phase}-${turn.roundNumber}`;
    if (key !== currentKey) {
      items.push({ kind: "divider", phase: turn.phase, round: turn.roundNumber, key });
      currentKey = key;
    }
    items.push({ kind: "turn", turn });
  }

  // Append any consensus reports we haven't paired yet, in order.
  const lastRound = turns.at(-1)?.roundNumber ?? 0;
  for (let i = 0; i < reports.length; i++) {
    const round = i + 1;
    if (emittedConsensusRounds.has(round)) continue;
    if (round <= lastRound + 1) {
      items.push({ kind: "consensus", report: reports[i], round });
      emittedConsensusRounds.add(round);
    }
  }

  return items;
}

function renderItem(item: Item, onJump: (id: string) => void) {
  switch (item.kind) {
    case "divider":
      return <PhaseDivider phase={item.phase} round={item.round} />;
    case "turn":
      return <TurnCard turn={item.turn} onJumpToRef={onJump} />;
    case "consensus":
      return <ConsensusCard report={item.report} />;
  }
}
