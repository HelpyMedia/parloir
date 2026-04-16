# 3 UI Concepts for the AI Round-Table Product

These are low-fidelity sketches meant to compare structure, not final visual style.

---

## Concept 1 — Cinematic Round Table

**Best for:** wow factor, differentiation, premium feel  
**Risk:** can feel like spectacle over utility if overdone

### Layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Session: “What is the best GTM strategy for product X?”                     │
│ Mode: Decide   Panel: Mixed Model Council   Phase: Critique Round 2         │
│ Consensus: 62%   Sources: 8   Est. Cost: $1.84                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                          [ animated round table scene ]                      │
│                                                                              │
│                 (Strategist)     (Moderator)      (Researcher)               │
│                                                                              │
│                        ╲              │              ╱                        │
│                         ╲         [TABLE]         ╱                         │
│                          ╲            │           ╱                          │
│                                                                              │
│                  (Skeptic)                      (Implementer)                │
│                                                                              │
│                                                                              │
│      Active speaker: Skeptic                                                │
│      “The proposal underestimates execution risk in channel partnerships.”  │
│                                                                              │
├───────────────────────────────┬──────────────────────────────────────────────┤
│ Persona cards                 │ Transcript / Evidence                        │
│                               │                                              │
│ Strategist   leaning Option A │ [Skeptic] Attacks assumption on CAC scaling  │
│ Skeptic      unconvinced      │ [Researcher] Added 2 market benchmarks       │
│ Researcher   gathering data   │ [Strategist] Revised recommendation          │
│ Implementer  risk warning     │                                              │
│ Moderator    evaluating       │ Expand turn ▸ citations ▸ tool usage ▸       │
├───────────────────────────────┴──────────────────────────────────────────────┤
│ [ Pause ] [ Interject ] [ Ask for more disagreement ] [ End now ]          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### What makes it work
- The **table is the emotional centerpiece**.
- Personas feel like characters with live presence.
- Transcript and evidence stay visible so it is still useful.
- Best for marketing screenshots and first impression.

### Key interaction ideas
- Active speaker glow around the avatar
- Small status labels: *researching*, *challenging*, *agreeing*, *revising*
- Paper cards or icons appear on the table when evidence is added
- Clicking a persona card filters the transcript to that persona

### Recommendation
Use this if your brand wants to feel **premium, novel, and memorable**.

---

## Concept 2 — Productivity-First Decision Dashboard

**Best for:** clarity, speed, serious work  
**Risk:** less differentiated visually

### Layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ New / Current Session                                                       │
│ Question: What is the best GTM strategy for product X?                      │
├───────────────┬──────────────────────────────────────┬───────────────────────┤
│ Panel setup   │ Live reasoning feed                  │ Decision board        │
│               │                                      │                       │
│ Mode          │ [Moderator] framed the question      │ Current leader        │
│ ○ Brainstorm  │ [Strategist] proposed PLG-first      │ Option A              │
│ ● Decide      │ [Skeptic] raised risk: CAC ceiling   │                       │
│ ○ Research    │ [Researcher] sourced 3 comps         │ Confidence            │
│               │ [Implementer] warned team bandwidth  │ 0.68                  │
│ Depth         │                                      │                       │
│ Quick         │ Live streaming turns...              │ Top tradeoff          │
│ Standard      │                                      │ Speed vs certainty    │
│ Deep          │                                      │                       │
│               │                                      │ Minority view         │
│ Personas      │                                      │ Try hybrid motion     │
│ ✓ Strategist  │                                      │                       │
│ ✓ Skeptic     │                                      │ Unresolved            │
│ ✓ Researcher  │                                      │ Channel attribution   │
│ ✓ Implementer │                                      │                       │
│ ✓ Moderator   │                                      │                       │
├───────────────┴──────────────────────────────────────┴───────────────────────┤
│ Argument map / sources / session timeline                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ [ Run ] [ Pause ] [ Ask follow-up ] [ Export ]                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### What makes it work
- The user always sees the **decision outcome forming in real time**.
- Very efficient for repeat use.
- Easier to build and test.
- Strongest for solo workflows.

### Key interaction ideas
- Right panel updates continuously with current leading option
- Bottom tabs switch between **Argument map / Sources / Timeline**
- Persona chips can be muted or expanded without interrupting the session
- Easy to compare Quick vs Deep sessions

### Recommendation
Use this if you want the product to feel **serious, practical, and sticky for daily use**.

---

## Concept 3 — Hybrid “Playable Council”

**Best for:** best balance between utility and distinctiveness  
**Risk:** more design work to get right

### Layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Session: Decide → “Should we launch feature X in Q3?”                       │
│ Phase 3: Evidence Pass   Consensus 47%                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Persona rail              Council stage                   Insight rail      │
│                                                                              │
│  ┌──────────────┐        ┌───────────────────┐         ┌──────────────────┐  │
│  │ Strategist   │        │   round table     │         │ Current best     │  │
│  │ supports A   │        │   mini-animated   │         │ Delay launch     │  │
│  ├──────────────┤        │   active speaker  │         ├──────────────────┤  │
│  │ Skeptic      │        │   research icons  │         │ Why              │  │
│  │ opposes A    │        │   stance markers  │         │ readiness risk    │  │
│  ├──────────────┤        └───────────────────┘         ├──────────────────┤  │
│  │ Researcher   │                                        │ Unresolved       │  │
│  │ fetching     │                                        │ user demand      │  │
│  ├──────────────┤                                        ├──────────────────┤  │
│  │ Implementer  │                                        │ Sources reviewed │  │
│  │ cautious     │                                        │ 6                │  │
│  └──────────────┘                                        └──────────────────┘  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ Transcript                                                                  │
│ [Moderator] We still disagree on timing. Researcher, validate demand signal.│
│ [Researcher] Found 2 benchmarks and 1 contradictory case study.             │
│ [Skeptic] Benchmarks are not comparable due to pricing model differences.   │
├──────────────────────────────────────────────────────────────────────────────┤
│ [ Interject ] [ Ask for one more round ] [ Challenge consensus ] [ Export ] │
└──────────────────────────────────────────────────────────────────────────────┘
```

### What makes it work
- The round table is present, but **contained**.
- The transcript remains the real work surface.
- Persona cards and insight rail make the session legible at a glance.
- Feels special without becoming decorative.

### Key interaction ideas
- Persona rail doubles as navigation and live stance tracking
- Center stage is a smaller living diorama, not full-screen spectacle
- Insight rail acts like a constantly updated executive summary
- Best for evolving into team features later

### Recommendation
Use this if you want the most balanced v1: **distinctive, usable, and scalable**.

---

# Fast Comparison

| Criteria | Concept 1: Cinematic | Concept 2: Dashboard | Concept 3: Hybrid |
|---|---|---|---|
| First impression | Excellent | Moderate | Strong |
| Practical for repeated use | Medium | Excellent | Strong |
| Build complexity | High | Low | Medium |
| Differentiation | Excellent | Low | Strong |
| Best for solo use | Medium | Excellent | Strong |
| Best v1 choice | Risky | Safe | Best balance |

---

# My recommendation

If this is your **first serious version**, I would choose **Concept 3 — Hybrid “Playable Council.”**

Why:
- it preserves your round-table vision,
- it still feels premium,
- it avoids turning the product into a cutscene,
- and it keeps the reasoning, transcript, and decision state easy to understand.

A good path would be:
1. Build Concept 3 first
2. Borrow the strongest practical pieces from Concept 2
3. Later add a more immersive “presentation mode” inspired by Concept 1

---

# Detailed Wireframe — Concept 3: Hybrid “Playable Council”

This version turns the chosen concept into a more concrete product wireframe with clearer screen regions, states, and interaction patterns.

---

## Primary screen structure

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Top bar                                                                                      │
│ Logo | Session title | Mode: Decide | Panel: Mixed Model Council | Save | Share later       │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Phase bar                                                                                   │
│ Frame Question → Opening Views → Critique → Evidence → Consensus → Final Synthesis         │
│                            [ current phase highlighted ]                                     │
├───────────────────────┬───────────────────────────────────────────────┬──────────────────────┤
│ Left rail             │ Center stage                                  │ Right rail           │
│ Persona panel         │ Live council scene                             │ Insight panel        │
│                       │                                               │                      │
│ ┌───────────────────┐ │        ┌──────────────────────────────┐       │ ┌──────────────────┐ │
│ │ Strategist        │ │        │                              │       │ │ Current best     │ │
│ │ stance: Option A  │ │        │      ROUND TABLE SCENE       │       │ │ Option B         │ │
│ │ confidence: med   │ │        │                              │       │ ├──────────────────┤ │
│ │ status: listening │ │        │   active speaker highlighted │       │ │ Consensus        │ │
│ └───────────────────┘ │        │   subtle idle animation      │       │ │ 47%              │ │
│ ┌───────────────────┐ │        │   research/tool icons        │       │ ├──────────────────┤ │
│ │ Skeptic           │ │        │   stance markers on avatars  │       │ │ Key tension      │ │
│ │ stance: against   │ │        │                              │       │ │ speed vs risk    │ │
│ │ confidence: high  │ │        └──────────────────────────────┘       │ ├──────────────────┤ │
│ │ status: speaking  │ │                                               │ │ Unresolved       │ │
│ └───────────────────┘ │                                               │ │ demand certainty │ │
│ ┌───────────────────┐ │                                               │ ├──────────────────┤ │
│ │ Researcher        │ │                                               │ │ Sources used     │ │
│ │ stance: pending   │ │                                               │ │ 6                │ │
│ │ status: browsing  │ │                                               │ └──────────────────┘ │
│ └───────────────────┘ │                                               │                      │
│ ┌───────────────────┐ │                                               │                      │
│ │ Implementer       │ │                                               │                      │
│ │ stance: cautious  │ │                                               │                      │
│ │ status: waiting   │ │                                               │                      │
│ └───────────────────┘ │                                               │                      │
│ ┌───────────────────┐ │                                               │                      │
│ │ Moderator         │ │                                               │                      │
│ │ status: scoring   │ │                                               │                      │
│ └───────────────────┘ │                                               │                      │
├─────────────────────────────────────────────────────────────────────────┴──────────────────────┤
│ Transcript + evidence drawer                                                                   │
│ [Turn 12 | Skeptic] The adoption forecast assumes paid acquisition efficiency that is not     │
│ reproducible with the current team structure.                                                  │
│    cited benchmark ▸ tool use ▸ supporting notes ▸ reply to this point                        │
│                                                                                                 │
│ [Turn 13 | Researcher] Found 2 comparable launches and 1 contradictory case.                  │
│    source 1 ▸ source 2 ▸ contradiction note ▸ attach to argument map                          │
│                                                                                                 │
│ [Turn 14 | Moderator] Main disagreement remains timing, not strategic direction.               │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Sticky action bar                                                                               │
│ [ Pause ] [ Interject ] [ Ask for another round ] [ Ask one persona ] [ Export summary ]      │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Information architecture

### 1. Top bar
Purpose: session identity and high-level controls.

Contents:
- Product logo
- Session title
- Mode badge: Brainstorm / Decide / Research
- Panel preset badge
- Save state
- Future placeholder for share/collaboration

Behavior:
- Session title editable inline
- Mode locked once session starts, unless user chooses “restart with different mode”

---

### 2. Phase bar
Purpose: make the process legible.

Phases:
1. Frame Question
2. Opening Views
3. Critique
4. Evidence
5. Consensus
6. Final Synthesis

Behavior:
- Current phase highlighted
- Completed phases clickable for review
- Hovering a phase shows what happened in that step
- In deep sessions, a phase can repeat, e.g. Critique 2 or Evidence 2

Why this matters:
This gives the user a sense that the panel is not just chatting randomly — it is following a method.

---

## Left rail — Persona panel
Purpose: make each participant legible and selectable.

Each persona card includes:
- avatar
- name
- role label
- current stance
- confidence level (low / medium / high, not precise percentage)
- status

Possible statuses:
- Listening
- Speaking
- Researching
- Revising
- Challenging
- Waiting
- Synthesizing

Additional interaction:
- Click persona card → filter transcript to that persona
- Hover persona → highlight that avatar at the table
- “Ask this persona” quick action on each card
- Optional “mute from next round” or “replace persona” later

Design note:
Keep cards compact but expressive. They should feel like living participants, not static profile cards.

---

## Center stage — Council scene
Purpose: emotional centerpiece and live activity visualization.

### Scene composition
- Circular or slightly isometric table
- 4–6 seated personas around it
- Soft ambient motion only
- Active speaker gets a glow/ring/spotlight
- Small animated status icons can appear briefly:
  - magnifier for research
  - exclamation point for challenge
  - check mark for agreement
  - pen/document for synthesis

### What should animate
Good:
- head turn toward current speaker
- subtle idle breathing / posture motion
- status icon pop-ins
- evidence cards appearing on the table
- gentle pulse under active speaker

Avoid:
- long cinematic pans
- talking-mouth lip sync for v1
- exaggerated character animation
- complex 3D environments

### Core UX principle
The stage should communicate:
- who is speaking,
- who is researching,
- whether the table is converging or splitting,
without requiring the user to read every line first.

---

## Right rail — Insight panel
Purpose: real-time executive summary.

Sections:

### Current best option
The option currently leading, if applicable.

### Consensus
A simple progress bar or dial.
Not “truth,” just current alignment.

### Key tension
The main tradeoff driving disagreement.
Example: speed vs reliability, cost vs flexibility, innovation vs execution risk.

### Unresolved questions
Questions still blocking a recommendation.

### Sources used
Count plus quick access to evidence drawer.

Optional later:
- Estimated cost
- Session duration
- Decision confidence
- “What changed this round?” summary

This rail is critical because it turns the raw discussion into something useful at a glance.

---

## Transcript and evidence drawer
Purpose: the real work surface.

### Default transcript item structure
Each turn shows:
- turn number
- persona name + role color
- condensed text by default
- expand for full text
- inline source / tool indicators
- quick actions

Quick actions:
- Expand
- See evidence
- Attach to argument map
- Ask follow-up on this point
- Mark as important

### Evidence drawer behavior
For turns involving research or citations:
- show linked sources
- highlight supporting vs contradictory evidence
- attach note: “used to support claim X”
- allow the user to inspect the evidence without leaving the session view

### Why this matters
The transcript is where trust is built. The scene creates engagement, but the transcript creates confidence.

---

## Sticky action bar
Purpose: persistent intervention without clutter.

Primary controls:
- Pause
- Interject
- Ask for another round
- Ask one persona
- Export summary

Secondary controls via overflow:
- Change depth
- Replace persona
- Restart in another mode
- Show full sources panel
- Show argument map

Important:
“Interject” should always be obvious. It is one of the most valuable product actions.

---

# Detailed interaction states

## A. Before run

```text
┌───────────────────────────────────────────────────────────────┐
│ What do you want the council to help you with?               │
│ [ large question input box ]                                 │
│                                                              │
│ Mode                                                         │
│ [ Brainstorm ] [ Decide ] [ Research ]                       │
│                                                              │
│ Panel preset                                                 │
│ [ Balanced Council ▼ ]                                       │
│                                                              │
│ Depth                                                        │
│ [ Quick ] [ Standard ] [ Deep ]                              │
│                                                              │
│ Personas in this panel                                       │
│ Strategist | Skeptic | Researcher | Implementer | Moderator  │
│                                                              │
│ [ Start session ]                                            │
└───────────────────────────────────────────────────────────────┘
```

## B. During live run
- Current speaker visible at center
- Transcript auto-scrolls, but user can pause scrolling
- Insight rail updates continuously
- If a tool is running, the relevant persona card shows status and spinner

## C. Paused state
- Table scene dims slightly
- Transcript stops auto-scrolling
- User gets larger input area to interject
- Suggestions shown:
  - Ask the skeptic to pressure-test the top option
  - Ask the researcher to validate one assumption
  - Ask the moderator to summarize the disagreement

## D. Final synthesis state

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Final recommendation                                                        │
│ Delay launch to Q4 unless demand validation exceeds threshold X             │
├──────────────────────────────────────────────────────────────────────────────┤
│ Why this wins                                                               │
│ - execution readiness is currently weak                                     │
│ - comparable launches showed slower adoption than assumed                   │
│ - downside risk of rushed launch is higher than delay cost                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Minority view                                                               │
│ Strategist still favors limited Q3 launch with constrained scope            │
├──────────────────────────────────────────────────────────────────────────────┤
│ Recommended next actions                                                    │
│ - validate demand with 10 customer calls                                    │
│ - build narrower launch plan                                                │
│ - revisit in 3 weeks                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ [ Export ] [ Start follow-up round ] [ Ask what would change the decision ] │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

# Component inventory for design

## Essential v1 components
- Session header
- Mode badge
- Phase progress bar
- Persona card
- Council stage
- Active speaker indicator
- Insight summary card
- Transcript item
- Evidence chip / citation row
- Sticky action bar
- Final recommendation panel

## Nice-to-have v1.5
- Argument map view
- Source inspector side sheet
- Persona customization modal
- Session replay mode
- “What changed?” diff summary between rounds

---

# Visual style direction

Recommended tone:
- dark, elegant, slightly futuristic
- polished but calm
- not cartoonish
- not gamer-neon heavy

Suggested feel:
- warm table spotlight in center
- muted interface chrome around it
- persona accents used sparingly for differentiation
- motion only where it adds comprehension

Keywords:
- council chamber
- thoughtful
- premium
- strategic
- cinematic restraint

---

# Mobile adaptation

For mobile, stack the experience into tabs:
- Stage
- Transcript
- Insights
- Personas

The center table remains useful as a compact live status view, but transcript and insights become the primary focus.

---

# Recommended next step

Turn this wireframe into one of these:
1. a visual mid-fidelity mockup,
2. a component hierarchy for development,
3. or a React prototype of the main live-session screen.

