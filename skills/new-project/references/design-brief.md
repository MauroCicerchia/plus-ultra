# Project design brief

Read this only when the product has a meaningful user interface. A library, CLI, service, data
pipeline, or scheduled job has none: skip design discovery entirely and never create a `DESIGN.md`
for it.

`DESIGN.md` lives at the repository root and holds durable, product-level visual direction. It is
not a component catalogue and it does not describe individual screens. Feature-level UI decisions
stay in the Issue design checkpoint.

## Run the conversation adaptively

Start from what is already settled. The approved `docs/product.md` usually implies the audience,
the tone, how dense the interface has to be, the platform, and the constraints the product operates
under. Infer those, state each inference visibly as an assumption, and do not ask about them again.

Then ask **one material visual decision at a time**, adapting the next question to the answer.
Material means the answer changes what gets built. For every consequential decision:

- offer two or three real alternatives;
- explain the trade-offs concretely;
- give your recommendation and why.

This is a short conversation, not a fixed questionnaire. A handful of decisions is normal. Stop
asking as soon as the choices that remain are ones implementation can reverse cheaply.

## What the document holds

Fill in [`../assets/DESIGN.md`](../assets/DESIGN.md) and delete every section the product has not
earned yet.

| Section | What it settles |
| --- | --- |
| Visual direction | The personality in a few sentences: what the product should feel like, what it must not resemble, and any reference or inspiration that clarifies the target |
| Color | Semantic roles and the meaning of each — surface, foreground, primary action, accent, border, and the operational states — plus the uses that are prohibited |
| Typography | The families, what each one is allowed to be used for, the reading defaults, and the limits |
| Spacing and shape | The spacing rhythm, the radius language, and how density is expressed |
| Component principles | How components behave and read as a family, not a specification per component |
| Interaction principles | Motion, feedback, state changes, and how the interface communicates progress and outcome |
| Responsive behaviour | Only where it materially changes layout decisions |
| Accessibility | Contrast floors, focus visibility, target sizes, and anything colour alone must never convey |

Keep the first version concise — roughly a page. Name the decisions that were actually made and the
prohibitions that matter. A vague statement that could describe any product is worse than an
omitted section.

## Propose, then write

Show the **complete proposed document** and write it to the repository root only after explicit
human approval. A declined or unanswered proposal leaves the repository unchanged.

`DESIGN.md` is then durable approved context: later work reads it and builds consistently with it.
Its product-level direction changes only through an explicit design or product decision a human
approves, never as a side effect of implementing a feature. Do not grow a version history, a
changelog, a status field, or a generated token file around it.
