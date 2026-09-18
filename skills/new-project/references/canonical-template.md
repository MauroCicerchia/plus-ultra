# The canonical template

`MauroCicerchia/plus-ultra-template` is the canonical starting point for a new TypeScript web
product. Conceptually it is a web frontend, a backend API, shared typed contracts, relational
Postgres persistence, a Tailwind and shadcn UI foundation, and Vercel deployment.

**The template repository is the source of truth for the stack.** Never restate its dependencies,
versions, package manager, tool choices, or file layout here or anywhere in Plus Ultra. Read its own
`README.md` and `AGENTS.md` after instantiating, and treat what they say as current.

## Judge fit from the approved context

Read the approved `docs/product.md`, and `DESIGN.md` when one exists, and place the product:

| Verdict | Looks like | Do |
| --- | --- | --- |
| Fits | A SaaS or product web application: frontend plus API, Postgres persistence, ordinary CRUD, workflow, or product behaviour | Instantiate and customize |
| Mostly fits | A web product that needs no persistence yet, wants a different database or provider, or replaces one infrastructure piece while keeping the web stack | Instantiate and adapt only the mismatch |
| Does not fit | A CLI or service in another language, a native mobile application, a reusable library or package, or an explicitly incompatible framework or runtime requirement | Skip the template and bootstrap directly |

Compatibility is the only question to resolve. Do not ask "do you want to use the template?", and do
not walk the human through defaults the template already owns. An explicit human technology
requirement overrides the template — for the whole choice when it is incompatible, for that one
piece when it is isolated.

## Instantiate into the product root that already exists

The root is not empty by the time you get here: `docs/product.md` is in it, and `DESIGN.md` too when
the product has an interface. Cloning over that root fails, and cloning elsewhere strands the
approved context outside the generated project. Stage the template under the transient `.context/`
directory instead, then materialize its working-tree files into the root. From the project root:

```sh
mkdir -p .context
gh api repos/MauroCicerchia/plus-ultra-template/tarball > .context/template.tar.gz
tar -xzf .context/template.tar.gz --strip-components=1
rm .context/template.tar.gz
git init -b main
```

The tarball holds the template's tracked files and none of its commits, so `git init -b main` starts
a genuinely fresh history on a deterministic default branch. Extraction leaves `docs/product.md` and
`DESIGN.md` alone: the template ships neither, so nothing collides.

Do not use `gh repo create --template`; it publishes a remote repository, which
`plus-ultra:integration-boundary` reserves for a human. Do not clone and then delete a `.git`
directory either: that needs a recursive force-delete, which Plus Ultra blocks, and this path never
creates one.

## Customize it yourself

There is no rendering engine and no configuration file to fill in. Read the instantiated files and
edit them as the coding agent:

- package and workspace names, so they name this product;
- `README.md` and `AGENTS.md`, so they describe this product instead of a template;
- the neutral starter screen and copy, replaced with something the product actually implies;
- the semantic theme foundation — colour roles, typography, spacing and radius — so it implements the
  approved `DESIGN.md`. The template's `README.md` and `AGENTS.md` name the stylesheet that holds
  those tokens. Change the token layer, not the component library.

Skip the theme step when step 2 produced no `DESIGN.md`; leave the neutral tokens alone rather than
inventing direction.

## Adapt a partial mismatch

Remove or replace only the pieces that genuinely do not fit, and delete what they leave orphaned —
configuration, environment samples, and their tests — so the project still installs, typechecks,
tests, lints, and builds. Keep everything else the template decided. Then report each material
deviation and why the product required it.

Do not add a second template, a variant, a registry, a version pin, or a flag that selects between
them. If adaptation is turning into a rewrite, the verdict was "does not fit": bootstrap directly
instead.
