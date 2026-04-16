# Page Override — Session (Live / Paused / Synthesis)

Inherits everything from `design-system/MASTER.md`. Only deviations are listed here.

## Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ TopBar (56px)       logo · title · mode · panel · save               │
├──────────────────────────────────────────────────────────────────────┤
│ PhaseBar (48px)     Frame › Opening › Critique › Evidence › …       │
├───────────┬──────────────────────────────────────┬───────────────────┤
│ Persona   │            Council Stage             │    Insight        │
│ Rail      │          (circular SVG table)        │    Rail           │
│ 240px     │              ~ 520px                 │    280px          │
│           │                                      │                   │
├───────────┴──────────────────────────────────────┴───────────────────┤
│ Transcript Drawer (flex-grow, scrolls)                               │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ StickyActionBar (64px)   Pause · Interject · Ask round · Export     │
└──────────────────────────────────────────────────────────────────────┘
```

Container: `max-w-[1600px] mx-auto`. On screens < 1280 px, rails collapse to icon-only drawers (deferred to v1.1 — out of scope for first pass).

## Council stage specifics

- Circular SVG, viewBox `0 0 600 400`.
- Table: ellipse cx=300 cy=200 rx=200 ry=110, fill `--color-bg-table`, stroke `--color-border-strong`.
- Seats: 6 positions distributed around the ellipse, rendered regardless of participant count (unused seats at 30% opacity).
- Active speaker: concentric halo ring using `--color-spot-halo`, scale 1.0→1.15 loop 1800 ms.
- Status icons float above the seat, fade in from `opacity:0 y:8` to `opacity:1 y:0` in 180 ms.

## Transcript

- Body: `text-base leading-relaxed max-w-[72ch]`.
- Speaker label: `font-display text-lg` + persona accent color.
- Meta row (tokens, cost, model): `font-mono text-xs text-text-dim`.
- Turn card entrance: framer-motion `initial={{opacity:0, y:4}} animate={{opacity:1, y:0}}` 220 ms.

## Insight rail

- Each card: 12px padding, 1px subtle border, stacked `gap-3`.
- ConsensusDial: SVG circle, `r=36`, stroke-width 6. Track `--color-border-subtle`, fill `--color-consensus`. Percentage in `font-display`.

## Synthesis state (state D)

- Stage + transcript hide, replaced with `SynthesisPanel` taking the full center column.
- Decision header: `font-display text-4xl leading-tight max-w-[60ch]` centered over an amber spotlight.
- Confidence badge: `high` = `--color-consensus`, `medium` = `--color-evidence`, `low` = `--color-dissent`.

## Paused state (state C)

- Stage container: `backdrop-filter: blur(2px) brightness(0.7)` with 280ms transition.
- PausedOverlay appears center-aligned with InterjectInput (auto-focused) and three InterjectSuggestions pills underneath.

## Accessibility

- All rails reachable via Tab key in visual order.
- Council stage exposes `aria-live="polite"` with "Now speaking: {name}" updates (no per-delta noise; only on `turn_start`).
- Transcript: each turn is an `<article aria-labelledby="...">` with the speaker label as accessible name.
