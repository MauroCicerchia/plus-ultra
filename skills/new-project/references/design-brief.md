# Project design brief

Read this only when the product has a meaningful user interface. A library, CLI, service, data
pipeline, or scheduled job has none: skip design discovery entirely and never create a `DESIGN.md`
for it.

`DESIGN.md` lives at the repository root and holds durable, product-level visual direction. It is
not a component catalogue and it does not describe individual screens. Feature-level UI decisions
stay in the Issue design checkpoint.

Its shape is not ours to invent. The document follows the [Google Labs `DESIGN.md`
convention](https://github.com/google-labs-code/design.md), an open format for handing a visual
identity to a coding agent, so any agent or tool that already reads the convention can build this
product without a translation step. Plus Ultra decides when the document is created and how it
changes; the external specification decides what it looks like. Consult that specification when a
detail below is not enough, and never copy it into this repository.

## Run the conversation adaptively

Start from what is already settled. The approved `docs/product.md` usually implies the audience,
the tone, how dense the interface has to be, the platform, and the constraints the product operates
under. Carry those inferences as working assumptions and do not ask about them again. Surface an
assumption only when it is materially uncertain or consequential enough that being wrong would
change the document; do not recite the ones that are obvious from the brief.

Then ask **one material visual decision at a time**, adapting the next question to the answer.
Material means the answer changes what gets built. For every consequential decision:

- offer two or three real alternatives;
- explain the trade-offs concretely;
- give your recommendation and why.

This is a short conversation, not a fixed questionnaire. A handful of decisions is normal. Stop
asking as soon as the choices that remain are ones implementation can reverse cheaply.

## What the document holds

Fill in [`../assets/DESIGN.md`](../assets/DESIGN.md) and delete every section the product has not
earned yet. The convention fixes the section names and their order: omit freely, but never rename
a section, reorder the ones you keep, or add a heading the product cannot fill.

| Section | What it settles |
| --- | --- |
| Overview | The personality in a few sentences: who it is for, what the product should feel like, what it must not resemble, and any reference that clarifies the target |
| Colors | The palettes and the role each one plays — primary, secondary, tertiary, neutral, surface and foreground, the operational states — plus the uses that are prohibited |
| Typography | The families, the levels and what each one is allowed to be used for, the reading defaults, and the limits |
| Layout | The spacing rhythm, the grid or container model, how density is expressed, and responsive behaviour where it materially changes layout |
| Elevation & Depth | How hierarchy is conveyed: shadow, tonal layering, borders, or whatever a flat design uses instead |
| Shapes | The radius language and any other shaping rule that reads as part of the identity |
| Components | How components behave and read as a family — including states, feedback, and motion — rather than a specification per component |
| Do's and Don'ts | The guardrails worth stating outright: contrast floors, focus visibility, target sizes, what colour alone must never convey, and the prohibitions that matter |

Keep the first version concise — roughly a page. Name the decisions that were actually made and the
prohibitions that matter. A vague statement that could describe any product is worse than an
omitted section.

## Structured tokens, only once there are tokens

The convention allows YAML frontmatter above the body carrying the machine-readable values: a
`name` for the design system, and the `colors`, `typography`, `spacing`, `rounded`, and
`components` groups. Emit it **only for values the conversation actually settled** — an exact
colour, a spacing step, a radius, a type ramp. A product that agreed on "warm, high-contrast,
generous whitespace" and no numbers has no tokens yet, and inventing some to fill the block
manufactures decisions nobody approved. No settled values means no frontmatter at all.

When frontmatter is present it carries the values and the body carries the meaning: what the role
is for, when to reach for it, and what it must never be used for. Do not repeat a colour or a step
in prose that the frontmatter already states, and do not paraphrase the body back into YAML. If a
whole token group was deliberately left undecided, the specification's `omitted` field records that
choice; with no frontmatter, an absent section already says it. The optional `version` field names
the format revision the document targets — take its current value from the specification, not from
here.

## Propose, then write

Show the **complete proposed document** and write it to the repository root only after explicit
human approval. A declined or unanswered proposal leaves the repository unchanged.

`DESIGN.md` is then durable approved context: later work reads it and builds consistently with it.
Its product-level direction changes only through an explicit design or product decision a human
approves, never as a side effect of implementing a feature. When refinement finds that a Story needs
direction this document does not cover, that is the path: propose the direction and the smallest
corresponding edit together, get approval for both, then change only what the decision touched.
Do not grow a version history, a changelog, a status field, or a generated token file around it, and
do not build a parser, a theme generator, or a sync command to consume it. A coding agent reads the
approved document and applies it directly.
