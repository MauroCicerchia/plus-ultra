# Engineering principles

Read this only when the changed surface materially involves business rules, architecture,
persistence, external integrations, or side-effect isolation. Ordinary small and local changes do
not need it.

These are principles for judging a design, not a layout to reproduce. They tell you what to weigh;
they do not tell you which directories to create.

## The principles

**Choose the simplest architecture that keeps the important logic testable and changeable.**
Structure is a cost paid for a benefit. Pay it where the logic is worth protecting, and nowhere
else.

**Keep non-trivial business rules out of transport, UI, and persistence glue.** When a rule is more
than a field check, it should be readable somewhere that is not a route handler, a component, a
query builder, or an SDK wrapper — so it can be understood and tested without standing up the
machinery around it.

**Isolate side effects when isolation materially helps.** Time, identity, storage, network, and
queues are worth pushing to an edge when doing so makes the interesting behaviour testable or
replaceable. When it does not, injecting them is ceremony.

**Prefer explicit, pure business logic where it fits.** Explicit inputs and returned results are
easier to test and reason about than hidden state and control flow thrown across boundaries. Model
expected failures as values when that makes the calling code clearer.

**Repository conventions override these defaults.** An existing codebase's patterns win. Consistency
with the code around a change is worth more than conformance to anything written here.

**Never add layers, ports, or adapters to trivial work to satisfy a pattern.** Indirection
introduced without a problem to solve is a cost with no benefit. If you cannot name what the
abstraction buys, do not add it.

## Using this during implementation

Let these shape the design of a change that already warrants it. They are not a checklist to
complete and never a reason to restructure code the change did not otherwise touch.

## Using this during review

Raise a principle only when the changed code violates it **and** the violation has a consequence you
can name — a rule that cannot be tested without a database, a behaviour that will have to be
duplicated at the next call site, an effect that makes the code unrunnable in a test. A finding with
no consequence behind it is a style preference; leave it out.
