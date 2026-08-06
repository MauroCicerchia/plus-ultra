# README Quick Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a concise Quick start section that helps users begin a new project or adopt the workflow in an existing repository.

**Architecture:** Make one documentation-only change in `README.md`, placing the new section between installation and optional companion material. Use two copy-paste prompts so readers can act immediately without duplicating the later reference sections.

**Tech Stack:** Markdown, Git

## Global Constraints

- Cover both new-project and existing-repository workflows.
- State that Superpowers supplies the methodology while `plus-ultra` supplies conventions, defaults, and guardrails.
- Keep the section concise and consistent with the README's current voice.
- Use installed skill names exactly: `plus-ultra:new-project` and `plus-ultra:spec`.

---

### Task 1: Add the Quick start section

**Files:**
- Modify: `README.md:17`
- Reference: `docs/superpowers/specs/2026-08-06-readme-quick-start-design.md`

**Interfaces:**
- Consumes: the existing `Install` and `Optional companions` sections in `README.md`
- Produces: a `Quick start` section with new-project and existing-repository paths

- [x] **Step 1: Insert the Quick start copy after installation**

Add this Markdown between the final Install paragraph and `## Optional companions`:

````markdown
## Quick start

After installation, tell your coding agent which path you are taking. Superpowers supplies the core
methodology; `plus-ultra` adds the repository conventions, stack defaults, and guardrails.

### Start a new project

```text
Use the plus-ultra:new-project skill to scaffold a new project for [describe the product]. Then use
Superpowers to brainstorm the first feature, write its implementation plan, implement it with TDD,
and verify the result.
```

### Use an existing repository

```text
In this repository, use Superpowers to brainstorm [describe the change]. After I approve the design,
use plus-ultra:spec to create and manage the repository spec, write the implementation plan,
implement it with TDD, verify the result, and prepare the pull request.
```
````

- [x] **Step 2: Validate Markdown structure and named skills**

Run:

```bash
rg -n '^## (Install|Quick start|Optional companions)$|^### (Start a new project|Use an existing repository)$|plus-ultra:(new-project|spec)' README.md
```

Expected: `Install`, `Quick start`, and `Optional companions` occur in that order; both path headings
and both namespaced skills are present.

- [x] **Step 3: Check formatting and review the focused diff**

Run:

```bash
git diff --check && git diff -- README.md
```

Expected: `git diff --check` is silent, and the focused diff contains only the new Quick start copy.

- [x] **Step 4: Commit the documentation change**

```bash
git add README.md docs/superpowers/plans/2026-08-06-readme-quick-start.md
git commit -m "docs: add README quick start"
```
