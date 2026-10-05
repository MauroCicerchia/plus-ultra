# Refinement verification

Verify only what the refinement changed. Editing a GitHub Issue does not invalidate application
tests, typecheck, lint, or build. If no verification-relevant implementation input changed, do not
run those repository checks just before the Issue write.

- Review proposed Issue content against the settled decisions before writing. Confirm the GitHub
  mutation succeeded; use a cheap read-back when it helps verify the handoff.
- For a feature design, follow Pencil's structural and visual validation. Confirm an approved
  repository-native design is durably Git-reachable before implementation depends on it.
- Run a targeted validator for an intentionally changed durable design or product document when one
  applies.

An unexpected source, runtime configuration, generated code, or other implementation artifact
change is exceptional. Route it to implementation, or run only the verification justified by that
explicit change. Do not silently apply the no-verification path to it.
