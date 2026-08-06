# README Quick Start Design

## Goal

Help a newly installed user begin using `plus-ultra` without first reading the complete feature
reference.

## Placement

Add a `Quick start` section immediately after `Install` and before `Optional companions`. This keeps
the first-use workflow next to the installation commands while preserving the existing detailed
reference below it.

## Content

The section presents two short, task-oriented paths:

1. **Start a new project:** give the agent a copy-paste prompt that invokes
   `plus-ultra:new-project`, then directs the user into the spec workflow.
2. **Use an existing repository:** give the agent a copy-paste prompt that starts with brainstorming,
   produces and approves a spec, implements the plan, verifies the result, and prepares a pull
   request.

Add a brief explanation that Superpowers supplies the core methodology while `plus-ultra` supplies
the repository conventions, defaults, and guardrails. Keep the section concise and avoid repeating
the detailed skill and hook descriptions later in the README.

## Validation

- Confirm the heading hierarchy and placement render correctly as Markdown.
- Confirm every named skill exists and uses its installed, namespaced name where applicable.
- Review the diff for clarity, brevity, and consistency with the README's current voice.
