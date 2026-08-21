# NoteKit code conventions — the enforced consistency contract

This is the **single source of truth** for how NoteKit code stays consistent, in the
spirit of paprika-go-utils' `lint/`. Every rule below is either **machine-enforced**
(ESLint / knip / dependency-cruiser / hooks / CI) or **explicitly a review rule**.
Unenforced "please be nice" guidelines do not belong here — if it matters, it gets a
gate; if it can't get a gate yet, it's marked _review-only_ so the gap is visible.

Enforcement layers, cheapest-first (a change must clear all of them):

| Layer | Runs | What it catches |
|---|---|---|
| `eslint.config.js` | editor, pre-commit (staged), CI | style, complexity, type-safety, forbidden patterns |
| `@notekit/eslint-plugin` | same as ESLint | project-specific rules (icons, reuse, transport) |
| `knip` | CI (report-only), `pnpm knip` | dead exports, unused files, unused deps |
| `dependency-cruiser` | CI, `pnpm depcruise` | architecture / layering boundaries |
| `tsc` (strict) | pre-push, CI | types |
| `gitleaks` | pre-commit | leaked secrets |

`knip` is wired but **report-only in CI** (`pnpm knip || true`) until its large pre-existing
dead-code backlog is burned down; `pnpm knip` locally still exits non-zero so the debt stays
visible. File size is enforced by ESLint `max-lines` at `error` (see #0), not a separate ratchet.

Unlike paprika (3 separate Go repos needing a `parity-check` to stop config drift),
NoteKit is **one pnpm monorepo with one config** — there is nothing to keep in sync, so
there is no parity gate. Everything is enforced against the **whole tree**, existing code
included (we do not diff-gate against a merge base; the tree is kept green). This covers every
surface — including `apps/backoffice` (Vite admin) and `apps/landing` (Next), which share this
root config rather than carrying their own. The only scoped exemptions are for genuinely
vendored/generated code (shadcn `ui/**` primitives, `routeTree.gen.ts`), mirroring paprika's
`generated: strict` — those are exempt from the maintainability heuristics but still type-checked.

---

## #0 — Complexity budgets (mirrors paprika gocyclo/gocognit/funlen/nestif)

| Metric | Limit | ESLint rule | Level |
|---|---|---|---|
| Cyclomatic complexity | 15 | `complexity` | error |
| Cognitive complexity | 15 | `sonarjs/cognitive-complexity` | error |
| Function length | 80 lines | `max-lines-per-function` | error |
| Nesting depth | 4 | `max-depth` | error |
| Params | 5 | `max-params` | error |
| File length | 800 lines (hard ceiling) | `max-lines` | error |

All budgets are `error` and the whole tree is clean against them. The pre-existing backlog
(cognitive-complexity hotspots + oversized `apps/api/src/routes/{auth,vault}.ts`,
`packages/core/src/components/{AIAssistantPanel,App}.tsx`, `packages/core/src/lib/secrets-vault.ts`)
was burned down by extracting helpers and splitting each oversized file into wired sibling
modules — so the ceilings could be raised from `warn` to `error`.

**Why:** the same reasoning as paprika — past these thresholds a function/file stops
fitting in one head. **How to comply:** extract cohesive helpers; do NOT paper over it
with `// eslint-disable`. A genuinely irreducible case needs a documented disable (see #7).

## #1 — Type safety is not optional

`any`, non-null `!`, `@ts-ignore` without description, and `as` casts that widen away
safety are **errors**. tsconfig runs `strict` + `noUncheckedIndexedAccess` +
`noUnusedLocals/Parameters`. **Why:** the vault handles E2EE ciphertext and money-like
integrity; a silent `undefined` is a data-loss bug. **How:** narrow with guards, use
`zod` at boundaries, model absence in the type.

## #2 — Icons are lucide-react, never emoji

No emoji as an icon, hint, placeholder, or status glyph. Use `lucide-react`.
Enforced by `@notekit/eslint-plugin/no-emoji-as-icon`. **Why:** emoji render
inconsistently across platforms and read as unpolished. _(User standing preference.)_

## #3 — Reuse `@notekit/core`, don't re-invent (mirrors paprika goutils-reuse)

Cross-cutting helpers live in `@notekit/core` (`logger`, `gravatar`, `link-kind`,
`file-paths`, `serialize`, crypto, `directory`, …). Re-deriving them by hand is an error
via `@notekit/eslint-plugin/no-reinvent-core`. **Why:** hand-rolled copies drift.
**How:** import the helper; if it's missing a case, extend the helper.

## #4 — Structured logging, never raw console

`console.*` is an error outside `**/lib/logger.ts` and dev scripts (`scripts/**`,
`docs/**`, `apps/*/scripts/**`). Use the `@notekit/core` logger so records carry context.

## #5 — Transport & crypto invariants (encoded from real bugs)

- `fetch` passed to the client must be bound to `globalThis`, not `this`
  (`@notekit/eslint-plugin/bind-fetch-globalthis`) — a real bug broke NoteKit under
  extension-wrapped fetch.
- Never strip the `encrypted` flag when reconciling notes after a pull.
_(review-only where a lint rule can't see it.)_

## #6 — Architecture boundaries (mirrors paprika decl-placement / module-size)

Enforced by `dependency-cruiser`:
- `@notekit/core` must NOT import from any `apps/*`.
- `@notekit/api-client` must NOT import React or DOM.
- No import cycles (`import-x/no-cycle`).
- An app must not reach into another app's internals.
File size is capped by ESLint `max-lines` (800, currently `warn` — see #0); there is no
separate size ratchet. Splitting an oversized file is always the fix.

## #7 — Suppressions are explicit and explained (mirrors paprika nolintlint)

Every `// eslint-disable-next-line <rule>` MUST carry ` -- <reason>`
(`@eslint-community/eslint-comments/require-description`). Blanket file-level disables and
unused/stale disable directives are errors. **Why:** a suppression without a reason is a
silent exception; with a reason it's an auditable decision.

---

## Running the gates

```bash
pnpm lint          # eslint, whole tree
pnpm knip          # dead code / unused deps
pnpm depcruise     # architecture boundaries
pnpm typecheck     # tsc strict, all packages
```

Local hooks (`git config core.hooksPath scripts/hooks`, wired by `pnpm hooks:install`):
- **pre-commit:** gitleaks + eslint on the staged `*.{ts,tsx}` files.
- **pre-push:** full `pnpm lint && pnpm -r typecheck`.

CI (`.github/workflows/ci.yml`) runs the same gates on every PR and push to `main`: a `lint`
job (`pnpm lint`, `pnpm knip` report-only, `pnpm depcruise`, `@notekit/eslint-plugin` tests) and
the existing `typecheck + build` job.

## Changing a rule

Edit `eslint.config.js` / `@notekit/eslint-plugin` / the depcruise config **and** update
this file in the same PR. This document and the enforcement must never disagree.
