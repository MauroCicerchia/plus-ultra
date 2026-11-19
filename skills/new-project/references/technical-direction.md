# The Technical Direction

Present it once, after the template-fit judgment and before anything exists on disk besides the
approved context. It is the single approval point between an approved brief and an initialized
repository: one message that ends in one explicit approval question, so a human in a terminal or an
app coordinating sessions can treat it as one decision.

A direct bootstrap takes the same step. A fundamental mismatch makes this proposal more important,
not less, because every major choice is being made on the human's behalf.

## What it states

Short and in plain language: a few lines per heading, readable in under a minute. Describe choices
at the conceptual level `canonical-template.md` uses — the kind of application, persistence, and
deployment target — never as packages. Never restate the template's dependencies, versions, tools,
or layout; the template repository stays their source of truth.

- **Template verdict.** Whether it fits, mostly fits, or does not fit, and the reason from the
  approved brief.
- **Direction.** The major stack choices: the kind of application, persistence, and deployment
  target, plus any other choice of that weight the product forces. For a fit, the template is the
  decision being approved: name it and its conceptual shape. Do not ask whether to use it, and do
  not walk through what it owns. For a partial fit, name each piece being adapted and why. For a
  direct bootstrap, name the language or runtime and the smallest baseline that runs and tests.
- **Settled by you.** Explicit human technology requirements stated earlier appear as settled and
  are not asked again. Omit the heading when there are none.
- **Alternatives.** Only where a real alternative exists, each with a recommendation. A default the
  template owns is not an open alternative. Omit the heading when there is nothing to weigh.
- **Deliberately left out.** The decisions not made yet because the product does not need them,
  such as a database for a product without persistence, a deployment target for a library, or
  architecture layering beyond what the baseline needs.

Close with one question that asks the human to approve this direction or say what to change.
Minor implementation choices stay with the agent and do not appear.

## Approval and revision

Only explicit approval of the displayed proposal starts initialization. Approval of the brief or
`DESIGN.md`, an earlier message, or silence does not count.

When the human asks for a change, revise what they asked for and whatever it forces, re-judge the
template verdict if the change moves it, show the complete revised proposal, and ask again. Repeat
until it is approved or declined.

A declined or unanswered proposal leaves the root without scaffolding: no extracted template, no
`git init`, no install, no generated file. The root holds only the approved context, and the run
stops there.

## Record it

After initialization, add a short `## Technical direction` section in the generated `AGENTS.md`: the
verdict, the approved major choices, the requirements the human settled, and what was left out, at
the same conceptual level as the proposal. It is the durable record later agents read before
proposing a change of direction. Never put it in `docs/product.md`; the brief states what is being
built, not how.

## Report it

The final report and the first commit reflect the approved direction. Name every deviation
initialization required and why, in both. A minor deviation, such as an extra configuration file a
tool turned out to need, is named and kept. A deviation that changes an approved major choice is not
something to report afterwards: stop, present a revised direction for approval before continuing,
and record the revised version.
