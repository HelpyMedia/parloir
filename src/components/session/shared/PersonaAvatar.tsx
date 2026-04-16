import { accentVar } from "@/lib/session-ui/persona-accent";

interface Props {
  personaId: string;
  name: string;
  size?: "sm" | "md" | "lg";
  active?: boolean;
  silenced?: boolean;
}

const sizeClass = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
} as const;

export function PersonaAvatar({ personaId, name, size = "md", active, silenced }: Props) {
  const initial = name.slice(0, 1).toUpperCase();
  const ring = active ? "ring-2 ring-offset-2 ring-offset-[var(--color-bg-chamber)]" : "ring-1";
  return (
    <div
      className={`grid place-items-center rounded-full bg-[var(--color-surface-raised)] font-medium ${sizeClass[size]} ${ring} ${silenced ? "opacity-40" : ""}`}
      style={{
        color: accentVar(personaId),
        boxShadow: active ? `0 0 0 1px ${accentVar(personaId)}` : undefined,
        ["--tw-ring-color" as string]: accentVar(personaId),
      }}
      aria-hidden
    >
      {initial}
    </div>
  );
}
