# NoteKit — project instructions

> Companion: **`CONVENTIONS.md`** = the enforcement map (which rule is gated by which tool).
> This CLAUDE.md is the **source of the rules**; CONVENTIONS.md is **how each rule bites**
> (ESLint / `@notekit/eslint-plugin` / knip / dependency-cruiser / hooks / CI). If the two ever
> disagree, fix it in the same PR — they must never contradict each other.

## Core principle — ALWAYS favor the long-term solution (MANDATORY, across everything)

For **anything** — design, code, vault schema, migrations, refactors, deploy, tooling, CI/CD,
naming, docs — **pick the solution that is right for the long term, not the fastest one.** We
**do not care** if it takes extra effort, more steps, or is slower now — as long as it is
**industry best practice** and **sustainable**. Technical debt (shortcuts, temporary patches,
"clean it up later") is **rejected** unless the user explicitly asks for it as a conscious
stop-gap (and if so, record it + file a follow-up).

Concretely:
- **Do not** take a hack that saves time now but makes debugging/auditing/maintenance harder
  later (in-memory instead of persisted, band-aiding state instead of fixing the source, dead
  code "just in case", `any`/`!` to appease the compiler). Do it right the first time.
- **Extra effort is accepted**: break big refactors into stages, write safe + reversible vault
  migrations, add tests, consolidate into reusable helpers in `@notekit/core`, write a design
  doc first for large changes.
- **Verify against the source before acting**: check best practice, check project memory/docs,
  check the live env (VPS) — do not assume. Being wrong because you didn't check something
  already documented is an avoidable mistake.
- **Do NOT introduce any fallback before confirming with the user.** A fallback of any kind —
  a legacy branch, a silent default when something is missing, fail-open, silent degradation,
  "if A fails use B", retrying via another path, a temporary hardcode — is **forbidden without
  explicit approval.** Fallbacks hide problems and send debugging astray. The default is
  **fail-fast with a clear error**. If you think a fallback is needed, **stop and ask first**.

Every specific rule below is a consequence of this principle.

## GOLDEN RULE — agent-native parity (MANDATORY)

**Anything a user can do through the UI, an agent MUST be able to do through the CLI + MCP/AI.**
NoteKit is an MCP-first product: every capability (create/edit/delete/move a note, task,
secret, folder, share) must have parity across **three driving adapters** — in-app UI, `apps/cli`,
and `apps/mcp` (plus in-app AI). Adding an action on one surface without the other two is a
**violation** (see the reference commit "move-to-folder across CLI, in-app AI, and MCP (agent
parity)").

In hexagonal terms this is a direct consequence of the dependency rule (see Architecture below):
- Every action is a **use case** — an inbound port in `application/`. The three surfaces are
  **driving adapters** that each call the SAME inbound port; the logic is never reimplemented per
  surface. A driving adapter's only job: parse input → call one inbound port → format output.
- Driving adapters NEVER import each other and NEVER share code. Parity comes from calling the
  same port, not from a shared UI/CLI/MCP helper. A business decision inside a surface belongs in
  `application/` or `domain/`, not the adapter.
- When adding an action, state which inbound port it is and how UI, CLI, and MCP each call it.
  If one isn't wired yet, that's debt to record, not to hide.

## Architecture — hexagonal (ports & adapters), inward-only

> **The one rule: source-code dependencies point inward only. An inner layer must never know
> anything about an outer layer.** Every architecture rule here is a consequence of it — when in
> doubt, return to it.

NoteKit is **one pnpm monorepo** built on hexagonal (ports-and-adapters) architecture. Four layers,
the SAME names in every language/package (folder names, not just concepts). Each module gets a
level; an import `a → b` is legal only when `level(b) ≤ level(a)`:

| Layer | Level | May import from | In NoteKit |
|---|---|---|---|
| `domain/` | 0 | `domain/` only — **zero external libs** | entities, value-objects, invariants, E2EE crypto primitives |
| `application/` | 1 | `domain/` + `application/ports/` | use cases (one file each, implements an inbound port), DTOs, port interfaces |
| `adapters/driven/` | 2 | `domain/`, `ports/out`, external libs | HTTP client, git vault, IndexedDB cache, SSE, native bridges, logger, gravatar |
| `adapters/driving/` | 2 | `domain/`, `ports/in`, external libs | UI (React components/stores/hooks), `apps/cli`, `apps/mcp`, `apps/api` handlers |
| composition root | 3 | everything | the **ONLY** place ports bind to adapters (`apps/*` entry / module wiring) |

`adapters/driven/` and `adapters/driving/` must **never** import each other.

**Mandatory folder skeleton** (per module). Do NOT invent alternative layer names —
`core/`, `services/`, `repositories/`, `data/`, `models/`, `utils/`, `infrastructure/`,
`interface/` are **forbidden as layer names**:

```
<module>/
├── domain/               # entities/ value-objects/ errors/ — zero external deps
├── application/
│   ├── ports/in/         # inbound: what the outside may ask this module to do
│   ├── ports/out/        # outbound: what this module needs from the outside
│   ├── usecases/         # one file per use case; implements an inbound port
│   └── dto/              # commands & queries crossing the boundary
└── adapters/
    ├── driven/           # implements outbound ports (DB, git, cache, HTTP, clock)
    └── driving/          # calls inbound ports (UI widget, CLI cmd, MCP tool, HTTP handler)
```

*driving* adapters call into the application (they drive it); *driven* adapters are called by it
(it drives them).

**Hard prohibitions** (errors, not style):
- `domain/` imports no external library (allowed: UUID, arbitrary-precision decimal, stdlib
  time). No ORM, framework, HTTP client, logger, DI decorator.
- `application/` imports only `domain/` + its own `ports/` — nothing from `adapters/`. A use case
  receives a **port**, never a concrete implementation.
- **Every external dependency becomes an outbound port** — no exceptions, even small ones.
  Calling `Date.now()`, `crypto.randomUUID()`, `fetch`, a hasher, a logger, or a git command
  directly from `domain/`/`application/` is a violation. Ports: `ClockPort`, `IdGeneratorPort`,
  `RandomPort`, `VaultPort`, `SyncPort`, `CryptoPort`, `StoragePort`, `NotifierPort`, …
- Port→adapter binding lives in exactly one file per module: the composition root.
- **Domain entities never cross an adapter boundary unchanged** — map to a DTO/presenter at the
  edge (`@notekit/api-client` owns the transport DTO shape; never serialize a domain `Note`
  straight to HTTP).
- Controllers/handlers/widgets/CLI commands carry no business logic — any conditional encoding a
  business rule belongs in `application/`/`domain/`.

**Trace a flow** in inward order, opening every layer with NO gaps:
`driving adapter (UI handler / CLI cmd / MCP tool) → inbound port (use case) → domain logic +
outbound port calls → driven adapter (api-client → apps/api endpoint → git vault) → sync`. For
actions, verify the same inbound port is reachable from `apps/cli` + `apps/mcp` (agent parity).

**The deletion test** (run before calling any change done): *if I deleted the entire `adapters/`
folder, would `domain/` + `application/` still compile?* If no, the dependency rule is broken —
find the leak and fix it. Every use case has a test running on in-memory adapters (no DB / network
/ broker); if it needs infrastructure to run, it has a dependency it should not have.

**When a rule blocks you**, don't work around it silently: use case needs the time → add
`ClockPort` (not `Date.now()`); two modules need the same entity → duplicate a minimal type or move
it to `shared/kernel/` (never import across a module boundary); controller needs data from two use
cases → call both inbound ports or add a use case; circular dep → invert one edge with an event or
extract a shared module. If none fit, **stop and ask** rather than violating a rule.

**Package → layer map** (target): `packages/core` holds `domain/` + `application/` + shared
adapters; `packages/api-client` is a driven adapter (transport — must NOT import React/DOM);
`apps/{web,desktop,mobile}` are composition roots mounting the UI driving adapter;
`apps/{cli,mcp}` are driving adapters with their own roots; `apps/api` is the backend composition
root binding driven adapters (Drizzle/Postgres, git). `apps/backoffice` + `apps/landing` are
separate surfaces on their own pipeline.

**Migration status (honest — do not hide this).** The current tree predates this rule:
`packages/core/src/{lib,stores,components,hooks}` still blends layers (e.g. stores call concrete
transport directly, `App.tsx` orchestrates crypto/sync in render, `lib/` mixes crypto-domain with
transport-driven). Treat hexagonal as the **target every new or changed module must follow** —
when you touch a blended area, carve out the layer you are in (extract the use case / port), do NOT
add to the blend. Structural moves (splitting `lib/` into `domain|application|adapters`) get a
design doc in `docs/` first and land in reversible stages.

## Repo boundaries
- Edit freely in `packages/*` + `apps/*`. `apps/landing` (Next) & `apps/backoffice` (Vite admin)
  have their own build/deploy pipeline, but share the SAME root ESLint config + budgets — no
  per-app lint config. Vendored shadcn primitives under `apps/backoffice/src/components/ui/**`
  are exempt from the maintainability heuristics (size/complexity) since they track upstream.
- **Do not touch `.claude/worktrees/**`** — those are other agents' worktrees (lint-ignored).
  Commit early / use an isolated worktree so your work isn't clobbered when another agent
  switches branches.

## Documentation — ONE centralized folder (MANDATORY)
**All documents** (design docs, plans, audits, session notes) MUST live in `docs/`. Do not
scatter new docs inside `apps/*/` or `packages/*/`. Naming: flat `YYYY-MM-DD-<kebab-name>.md`
at the root of `docs/`, or under an existing topic subfolder.

## Design system & product docs — stay in sync (MANDATORY)

NoteKit has two live reference sites, both built from this repo (`apps/design`, `apps/docs`):

- **`design.notekit.online`** — the design system (`apps/design`). Foundations render live from
  **`@notekit/tokens`** (the single source of truth for color/type/spacing/radius/etc.); the
  Components section is the reference spec for every UI primitive (Button, Dialog, Text field,
  Code input, App bar, Navigation drawer, …) including their **web↔mobile platform variants**
  and rules like dialog button width/layout and content.
- **`docs.notekit.online`** — the product docs (`apps/docs`): how NoteKit works, for users,
  self-hosters, and MCP/agent integrators.

**The app UI (web/desktop/mobile via `@notekit/core`, plus backoffice) MUST match the design
system, and the two must never drift:**

- **Tokens flow one way.** Every surface consumes `@notekit/tokens` (core → `css/core.css`,
  backoffice → `css/backoffice.css`, landing → `css/landing.css`). Never hardcode a color/radius/
  spacing value in a component — add/adjust the token in `packages/tokens` and rebuild. Changing a
  value in one surface's CSS instead of the token is a violation.
- **Build a component to the documented spec.** When you add or change a UI primitive, it must
  follow its page on `design.notekit.online` (variants, tokens, states, mobile behavior, dialog
  button width/layout + content rules). If the spec is wrong, fix the spec first (`apps/design`),
  then the app — don't silently diverge.
- **A change to shared UI updates BOTH the app and the design site in the same PR.** New primitive
  or new variant → add/adjust its `apps/design` component page + showcase alongside the app code.
  A shipped-but-undocumented primitive, or a documented-but-unshipped one, is drift to fix, not
  leave. (Consistent with the honest-surfaces rule: the site documents what exists.)
- **Behavioral/API changes get product docs.** A user- or agent-visible capability change updates
  `apps/docs` in the same PR.
- These two sites are **driving-adapter surfaces with their own composition roots**; they consume
  the published token output + public component entrypoints, never blended `packages/core`
  internals (see Architecture).

## Clean-code rules (MANDATORY — apply on every edit)

Enforcement per rule → see `CONVENTIONS.md`. In short:

0. **Names are CLEAR, never abbreviated (HARD RULE).** Applies to everything: functions, types,
   components, hooks, variables, fields, constants, files. Spell out domain terms:
   `req`/`res`→`request`/`response`, `msg`→`message`, `cfg`→`config`, `addr`→`address`,
   `acc`→`account`, `idem`→`idempotencyKey`, `enc`→`encrypted`. When in doubt, spell it out;
   **a long clear name beats a short ambiguous one**. **Narrow exceptions** (universal JS/TS/
   React idioms, do NOT expand): `ctx`, `err`, `id`, `db`, `props`, `ref`, `el`, `fn`, loop
   `i`/`j`.
1. **Cross-surface consistency — HARD RULE.** The same concept MUST be identical across web/
   desktop/mobile/cli/mcp: **names**, **shapes** (DTO/args, field order, error shape),
   **patterns**. If the CLI uses `folderId`, the MCP/UI must not use `dirId`. When you touch one
   surface, check the others; silent divergence is a bug waiting to happen. (The agent-native
   golden rule is a special case of this.)
2. **Icons are `lucide-react`, emoji are FORBIDDEN.** Not as an icon, hint, placeholder, or
   status glyph. Emoji render inconsistently across platforms and read as unpolished. Enforced
   by `@notekit/eslint-plugin/no-emoji-as-icon`.
3. **No dead code / half-built features in the UI.** Remove dead branches, commented-out code,
   unused exports/files (enforced by `knip`). **UI status copy must match what is actually
   wired** — don't promise features that aren't live yet (pitch phrasing like "offline-first" /
   "MCP-native" stays in the README, not as misleading UI status).
4. **Consolidate inner logic; keep adapters independent.** Don't duplicate a rule — unify it in
   the right inner layer (`domain/` or `application/`). But driving adapters (UI/CLI/MCP) must NOT
   share code with each other — they converge by calling the same inbound port, never a shared
   surface helper. A recurring pattern → record it in `docs/` + tidy it up.
5. **Put things in the right layer + make them reusable.** Domain helpers (crypto, serialize,
   value-objects, link-kind, file-paths, directory) → `domain/`; external-service wrappers (logger,
   gravatar, HTTP, git) → an outbound **port** + a driven adapter — never re-derived per file/per
   surface (enforced by `@notekit/eslint-plugin/no-reinvent-core`). Architecture boundaries
   (enforced by `dependency-cruiser`, see Architecture): imports point **inward only**; `@notekit/
   core` must **not** import `apps/*`; `@notekit/api-client` (driven) must **not** import React/DOM;
   `adapters/driven` and `adapters/driving` must not import each other; no import cycles.
6. **No god-files.** Healthy target ≲ ~500 lines, hard ceiling 800 (ESLint `max-lines`, error).
   Complexity budgets (all error): cyclomatic & cognitive ≤ 15, function ≤ 80 lines, nesting ≤ 4,
   params ≤ 5. Over the limit = **extract a helper** (split the file into wired siblings), never
   `// eslint-disable`.
7. **Avoid comments.** Good code explains itself. Comments only for **why** (not **what**) or a
   public contract. **English only** (public OSS repo). Ideally none; if unavoidable, keep it
   short. No work-tracker codes in comments (`P0`, `Phase N`, `#NN` issue, bare `TODO`) —
   describe the thing, not the ticket.
8. **Tests are colocated (`vitest`).** `foo.test.ts` next to `foo.ts`. Mobile E2E → Maestro in
   `e2e/`. Web E2E → `e2e/`. No separate `tests/` tree.
9. On every task: if you find a violation above on a path you touch, **clean it up along the
   way** + record it.

## E2EE, transport & git invariants (encoded from real bugs — DO NOT break)

- **Least-privilege agents:** an agent decrypts **only what is shared to it** (its own age
  key), NEVER the master phrase. Default: agents can write but cannot read without a grant.
- **Don't reinvent Git:** audit, history, attribution, forward-only revocation are already
  solved by Git/commit author. Do NOT build a parallel system for them.
- **`fetch` MUST be bound to `globalThis`, not `this`** — a real bug: the client bound `this`
  and broke under extension-wrapped fetch. Enforced by
  `@notekit/eslint-plugin/bind-fetch-globalthis`.
- **Never strip the `encrypted` flag** when reconciling notes after a pull (`replaceAll` can
  clobber the local flag; the notes subscribe path must keep `!!encrypted`).
- **Device key = IndexedDB per install.** Reinstall/clear → orphaned device → pairing deadlock;
  recover via the 24-word phrase or another still-ready device. Keep this in mind when
  debugging E2EE auth.

## Observability — a trace must explain a failure without reproducing it (MANDATORY)

Every request is traced (OTel → Tempo) and every span should carry enough to debug from
the trace **alone** — we should never have to re-run the failing call or SSH into a
container to read a log. This rule is encoded from a real bug: an approve returned `502
unknown_error`, but the trace only showed `PUT /vault/file → 500`; the actual cause
(Forgejo `UpdateFile: object does not exist`) was in the provider's **response body**,
which the code read (`await res.text()`) then threw away — invisible in Tempo.

- **Third-party/external calls MUST record their outcome on the span.** OTel's auto HTTP
  instrumentation gives the outbound **method + url + status** but NEVER the bodies. So on
  a non-OK response from any external service (Forgejo/GitHub/GitLab, Stripe, an OAuth
  provider, …), attach the **response body** to the active span (see
  `adapters/driven/git/error-trace.ts` → `gitError`). A failure from a service we don't
  own must be legible in the trace.
- **For writes/mutations, also record the request payload that decides behaviour** — the
  method, target path/id, and discriminating fields (e.g. the prior `sha` that picks
  create-vs-update), via `recordGitRequest`. NOT the content bytes (large + user data) and
  **never secrets** (tokens, phrases, plaintext).
- **Do not put tracing in `domain/`.** Spans are an outer concern; `domain/` stays
  dependency-free (see Architecture). Record on the span in the driven adapter that made
  the call.
- New integrations with an external service ship with this instrumentation from the start —
  a third-party error that only shows a bare status code is a bug, not just missing polish.

## Git, commit & push
- **`main` is the default branch.** Before substantive work, **branch first**; commit/push only
  when the user asks.
- **Never `git add -A` / `git add .`** — the working tree may hold another agent's WIP. Stage
  specific files (`git add <path>...`); verify `git diff --cached --name-only` before committing.
- **`--no-verify` is forbidden** (commit and push) — it bypasses gitleaks + the eslint hook +
  the size ratchet. A failing hook → **fix the violation**, don't bypass. A legitimate
  suppression is `// eslint-disable-next-line <rule> -- <reason>` with a reason, not
  `--no-verify`.
- Commit messages: conventional (`feat(scope):`/`fix(scope):`), ending with the trailer
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Deploy & prod ops (VPS) — real gotchas
- Prod on VPS `152.53.225.25`; domains `app.notekit.online` (app), `api.`, `git.` (Forgejo).
- **Deploy = re-run the pipeline, not editing .env on the server.** Restart the stack via
  `gh run rerun` on `deploy.yml` — the env lives in CI, there is **no `.env` on the VPS disk**.
- **Traefik returning a Go 404** = the stack is down (not a route bug). The **Forgejo LevelDB
  queue crash-loop** has its own fix — check the prod runbook in memory/docs before guessing.
- Verify at runtime (service logs) that it's really the expected process before calling it
  "live".

## Running the gates (see CONVENTIONS.md for details)
```bash
pnpm lint        # eslint, whole tree
pnpm typecheck   # tsc strict, all packages
pnpm knip        # dead code / unused deps
pnpm depcruise   # architecture / dependency rule (the arch check)
```
`pnpm depcruise` is the architecture gate — it enforces the inward-only dependency rule. If a
change makes it fail, **fix the code, not the config**: relaxing an architecture rule to silence a
violation needs explicit human approval. Local hooks: `pnpm hooks:install` (sets
`core.hooksPath=scripts/hooks`). CI runs the same gates on every PR + push to `main`.
