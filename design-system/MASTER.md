# Parloir Design System — MASTER

Global source of truth. Every page inherits from this unless `design-system/pages/<page>.md` overrides it.

## Project

**Parloir** — a council of AI personas that deliberate a question through a structured protocol and produce a synthesized deliverable. The UI dramatizes that council: a warmly-lit round table at the center, surrounded by cool, quiet chrome.

## Tone

Dark council chamber. Premium but calm. Cinematic restraint — motion only where it communicates who is speaking, researching, or converging. Not gamer-neon. Not dashboard-flat. Not talking heads.

## Color tokens

Exposed as Tailwind v4 theme variables in `src/app/globals.css` and usable as utility classes (`bg-bg-chamber`, `text-text-primary`, `border-border-subtle`, etc.).

### Surfaces
| Token | Hex | Purpose |
|---|---|---|
| `--color-bg-chamber` | `#0B0D10` | Page background, cool near-black |
| `--color-bg-table` | `#14100C` | Stage core, warm near-black |
| `--color-surface-card` | `#161A1F` | Default card surface |
| `--color-surface-raised` | `#1D232B` | Hovered/active card |

### Spotlight
| Token | Value | Purpose |
|---|---|---|
| `--color-spot-warm` | `#E8B464` | Amber highlight at center |
| `--color-spot-halo` | `rgba(232,180,100,0.18)` | Radial fade into table |

### Persona accents (muted)
Use sparingly — avatar ring, stance chip, transcript name color only. Never as background fill for large surfaces.

| Token | Hex | Default role mapping |
|---|---|---|
| `--color-persona-strategist` | `#7DA3C8` | Pragmatic Operator, Stakeholder Proxy |
| `--color-persona-skeptic` | `#C8847D` | Skeptical Auditor |
| `--color-persona-researcher` | `#8BB18B` | Domain Expert |
| `--color-persona-implementer` | `#C8A87D` | Pragmatic Operator (variant) |
| `--color-persona-moderator` | `#A88BC8` | Creative Synthesizer |

The assignment function lives in `src/lib/session-ui/persona-accent.ts` — it hashes `persona.id` to one of the 5 accents so color stays stable across sessions.

### Text
| Token | Hex | Purpose |
|---|---|---|
| `--color-text-primary` | `#EDE8DF` | Body and headings |
| `--color-text-muted` | `#9AA0A6` | Meta labels |
| `--color-text-dim` | `#6C727A` | Timestamps, IDs, tertiary |

Contrast check: primary on chamber ≈ 14.2:1, muted on chamber ≈ 7.1:1 — both pass AA for all text sizes.

### Semantic
| Token | Hex | Use |
|---|---|---|
| `--color-consensus` | `#8BB18B` | Consensus dial fill, agreement icon |
| `--color-dissent` | `#C8847D` | Minority marker, dissent chip |
| `--color-evidence` | `#E8B464` | Evidence chip, source citation |
| `--color-danger` | `#E07B6A` | Error banners |

### Borders
`--color-border-subtle` for default separators. `--color-border-strong` for focused/active elements. No drop shadows anywhere — raise via `ring-1 ring-border-strong` instead.

## Typography

Fonts loaded in `src/app/layout.tsx` via `next/font/google`:

| Family | Role | Usage |
|---|---|---|
| **Fraunces** (serif, variable, opsz+SOFT axes) | Display | Session titles, synthesis headlines, phase labels |
| **Inter** | UI | Body, rails, labels, buttons |
| **JetBrains Mono** | Meta | Turn IDs, token counts, timestamps, cost |

### Scale
| Class | px | Use |
|---|---|---|
| `text-xs` | 12 | Meta, chips |
| `text-sm` | 14 | Body, rail content |
| `text-base` | 16 | Transcript body (mobile min) |
| `text-lg` | 18 | Section headings |
| `text-2xl` | 24 | Session title |
| `text-4xl` | 36 | Synthesis decision |

Line-height: `leading-relaxed` (1.625) for body/transcript, `leading-tight` (1.15) for display. Line-length cap: `max-w-[72ch]` inside transcript.

## Motion

Library: `framer-motion`. Always wrap durations in a `useReducedMotion()` check.

| Element | Property | Duration | Easing |
|---|---|---|---|
| Active speaker halo | opacity + scale loop | 1800 ms | ease-in-out |
| Stage status icon | pop in / out | 180 ms in / 240 ms out | spring(stiffness 260, damping 20) |
| Turn card entrance | opacity + y(4→0) | 220 ms | ease-out |
| Phase bar advance | width + color | 320 ms | ease-out |
| Pause dim | backdrop blur + brightness | 280 ms | ease-out |

Reduced motion: keep fades only. Disable halo loop, disable spring pops, disable blur.

## Icons

Library: **lucide-react**. All icons at `w-4 h-4` (chips), `w-5 h-5` (cards), `w-6 h-6` (stage).

| Event | Icon |
|---|---|
| Phase (clock) | `Clock` |
| Synthesis | `Sparkles` |
| Research tool call | `Search` |
| Challenge | `AlertCircle` |
| Agreement | `Check` |
| Pause | `Pause` |
| Resume | `Play` |
| Interject | `Send` |
| Export | `Download` |
| Edit (title inline) | `Pencil` |

No emojis as icons anywhere.

## Effects & layout

- **Stage:** one radial gradient `radial-gradient(circle at center, var(--color-spot-halo), var(--color-bg-chamber) 70%)`. No shadows inside.
- **Cards:** flat `bg-surface-card` with 1px `border-border-subtle`. Hover → `bg-surface-raised` + `ring-1 ring-border-strong`. Never drop shadow.
- **Grid:** max width `1600px`, 3-column main `240px | 1fr | 280px`, transcript below.
- **Spacing:** 8px base, `gap-3` (12) for dense rails, `gap-6` (24) for shell sections.
- **Radius:** `rounded-lg` (8px) for cards, `rounded-full` for avatars and chips, `rounded-2xl` (16px) for stage container.

## Interaction

- All clickable elements: `cursor-pointer`.
- Focus ring: `focus-visible:ring-2 focus-visible:ring-spot-warm focus-visible:ring-offset-2 focus-visible:ring-offset-bg-chamber`.
- Hover feedback: color/ring change, never layout shift.
- Tab order matches visual order; transcript auto-scroll is pauseable.

## Anti-patterns (do not)

- Shadows on card-to-card separation (use borders/ring).
- Bright neon accents (keeps it out of gamer-UI territory).
- Emoji icons.
- Mixed icon sets.
- `dark:` prefixes — the whole app is dark-only in v1.
- Hover transforms that shift siblings (use color/ring).
- Content hidden under the sticky action bar (reserve `pb-20` on scroll containers).

## Persistence

- `src/app/globals.css` — `@theme` block defines tokens.
- `src/app/layout.tsx` — loads fonts, sets the html `font-*` CSS variables.
- No Tailwind config entries needed — Tailwind v4 reads `@theme` directly.
