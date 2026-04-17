# Topic-Aware Panel Curator (next feature)

**Status:** concept / not scoped yet. Placeholder to preserve context for a
future brainstorm → plan → implement cycle.

## The idea

Today, debate panels are composed of 2–5 personas the user picks from a static
list of templates; every persona uses whatever `model` string is baked into its
template JSON. That means a "Science" question gets the same Anthropic/OpenAI
blend as a "Creative" question.

OpenRouter gives us access to a much wider spectrum of specialized models:
reasoning (DeepSeek R1, QwQ, Grok), coding (Qwen 2.5 Coder, Codestral),
citation-grounded research (Perplexity Sonar), long-context (Gemini 2.5 Pro,
Command R+), creative synthesis (Mistral Large), and many more. A well-chosen
mix per question should beat a fixed roster.

**Proposed move:** a cheap _panel curator_ step runs once on the user's
question before debate kickoff. It classifies the question along topic
dimensions (math/reasoning, coding, research, creative, policy, scientific,
legal…) and picks 3–5 personas where each persona's base model matches the
dimensions in play. Persona templates keep their role identity (Skeptical
Auditor, Pragmatic Operator…); the curator rewrites `persona.model` per
session.

## Open questions (decide in brainstorm)

1. **Auto vs manual.** Default to auto-pick with edit-before-kickoff, or keep
   manual and surface the curator as a "Suggest panel" button?
2. **Curator model.** Fixed (cheap) model, or user-configurable in settings?
3. **Topic taxonomy.** Fixed enum, tags, or open-ended? How many dimensions?
4. **Model registry.** Do we need a new `models.json` catalog that tags each
   model with strengths (reasoning/coding/research/…) and rough price tier?
   Yes, probably — and it should be derivable from OpenRouter's API.
5. **Persona/model coupling.** Are there role↔model affinities we should
   preserve (e.g. Skeptical Auditor really does want a pedantic model)?
6. **Cost transparency.** Show estimated session cost up front based on the
   chosen panel so the user can downgrade before committing.

## Adjacent pieces that get easier with this

- Live "which model said what" display (we already store `turn.model` per
  turn — just needs surfacing).
- Per-model performance analytics across many sessions (does the reasoning
  slot consistently add novelty, or is one slot redundant?).

## How to proceed

Fresh conversation when ready:
1. `/brainstorm` session scoped to this doc — answer the open questions.
2. `/plan` the implementation.
3. `/subagent-driven-development` to ship it.

Do **not** treat this note as a spec. It's a capture, not a design.
