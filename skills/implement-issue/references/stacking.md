# Stacking on a design pull request

Read this when the Issue's Design section names a design pull request from refinement. Without one,
branch from the default branch as usual and skip this file.

## Decide from the design pull request's state

Run `gh pr view <number> --json state,headRefName`.

- **Open:** stack the implementation on it, as below. Do not wait for it to merge.
- **Merged:** branch from the default branch; the design is already there.
- **Closed without merging:** stop. The approved design is no longer durable; report the Issue as
  blocked and route it back to `plus-ultra:refine-issue`.

## Branch from the design branch

Fetch the design branch and start the implementation branch from it, so the design reference is
present in the worktree from the first commit:

```bash
git fetch origin <headRefName>
git switch -c <branch> origin/<headRefName>
```

Never commit implementation work to the design branch, and never edit the design artifact here. If
the design pull request gains commits later, rebase the implementation branch onto it.

## Open the pull request as the top of a stack

Create the implementation pull request from the usual body template, based on the design branch so
its diff shows only implementation:

```bash
gh pr create --base <headRefName> --title "<title>" --body-file <body>
gh stack link <design-pr> <implementation-pr>
```

`gh stack link` groups both pull requests as a GitHub stack without local tracking state. Pass the
pull request numbers, bottom first. Do not use `gh stack submit` or `gh stack init` here: they
replace the body template with generated titles and bodies, and keep local state this workflow
does not need.

When `gh stack` is not installed, or `gh stack link` exits 9 because the repository has stacked pull
requests disabled, keep the pull request based on the design branch. Report it as **stacked by base
branch only**, so the human can group it on GitHub. Never retarget it to the default branch.

## Report

Report both pull requests, bottom first, and say how they were stacked. Integration stays human:
merge the design pull request first, then the implementation. After the design merges, retarget or
rebase the implementation pull request only when the human asks.
