# Verification operations

## Install or update an existing project

Copy the template from the installed Plus Ultra skill once, then commit it with the project:

```sh
mkdir -p scripts
cp skills/verification/assets/plus-ultra-verify.mjs scripts/plus-ultra-verify.mjs
```

Resolve the source `skills/verification/assets/plus-ultra-verify.mjs` inside the installed Plus
Ultra package; never point the project script at an agent cache. Review and deliberately copy a new
template version when upgrading Plus Ultra. The project owns its checked-in wrapper version.

## Run and read verification

```sh
node scripts/plus-ultra-verify.mjs test -- pnpm -r test
node scripts/plus-ultra-verify.mjs typecheck -- pnpm -r typecheck
node scripts/plus-ultra-verify.mjs lint -- pnpm -r lint
```

Labels are lowercase slugs. A clean pass prints one summary capped at 1 KiB. A warning prints its
summary plus an excerpt capped at 20 lines and 8 KiB. A failure or unknown state prints a summary
plus an excerpt capped at 80 lines and 16 KiB, then exits non-zero. The wrapper writes a JSON receipt
under `.context/plus-ultra/verification/`; use that receipt for argv, duration, detected diagnostics,
source states, and log paths. Each summary includes the first 12 characters of the final source
fingerprint (or `unknown`). Full logs exist for warnings, failures, and unknown results, not clean
passes. A source state that cannot be captured or changed while a command runs is unverified.

When verifying a `plus-ultra:context-handoffs` reference, read only the source snapshot, required
commands, applicable risk controls, and receipts named for this phase. Record receipt references in
the next handoff; expand to a retained log only for a failed or unknown result, source mismatch, or
other stated expansion trigger. Do not carry product-discovery history or implementation rationale
into verification.

## Bounded inspection recipes

Use narrow, read-only queries that answer the current question instead of broad dumps:

```sh
git status --short --untracked-files=normal
git diff --check
git diff --stat
git log -1 --format='%h %s'
gh issue view 65 --json number,title,state,url
gh pr list --limit 10 --json number,title,headRefName,isDraft,url
```

For a large JSON response, request only needed fields with `--json`, set `--limit`, and inspect one
identified item with `gh issue view <number>` or `gh pr view <number>`. Do not intercept or wrap
arbitrary `git` or `gh` commands: these recipes are opt-in, bounded inspections only.
