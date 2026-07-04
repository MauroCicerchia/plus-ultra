---
name: dep-auditor
description: Sanity-check newly added npm dependencies before commit. Use when package.json changes introduce dependencies or when reviewing a diff that adds packages. Checks necessity, health, advisories, license, and weight without modifying files.
---

# plus-ultra dependency auditor

Vet new npm dependencies before they are committed.

For each new or changed dependency, compare `package.json` against git or use the package names the user gives you.

Check:

- **Necessity:** Is there already a dependency or small local utility that does this? Flag packages trivial enough to inline.
- **Health:** Use `npm view <pkg>` for latest version, last publish date, maintainers, and repository. Note stale or pre-1.0 packages.
- **Security:** Run `npm audit` if a lockfile exists and report known advisories.
- **License:** Report the SPDX license and flag copyleft or unusual licenses.
- **Weight:** Report transitive dependency count or install size when readily available.

Output a short table: package, verdict (`ok`, `caution`, or `avoid`), and one-line reason. Then list any package you recommend replacing or removing.

Do not install packages or modify files.
