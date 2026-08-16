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
secret, folder, share) must have parity across **three surfaces** — in-app UI, `apps/cli`, and
`apps/mcp` (plus in-app AI). Adding an action on one surface without the other two is a
**violation** (see the reference commit "move-to-folder across CLI, in-app AI, and MCP (agent
parity)").

Consequences:
- Business logic lives in `@notekit/core` so all three surfaces go through the SAME path —
  never reimplemented per surface. UI/CLI/MCP are thin adapters over core.
- When adding an action-oriented feature, state explicitly how the UI, CLI, and MCP each call
  it. If one isn't wired yet, that's debt to record, not to hide.

## Architecture & how to trace a flow

NoteKit is **one pnpm monorepo**. A flow crosses surface → core → api-client → API/VPS → git
vault (often E2EE). When tracing/opening a flow, open EVERY connecting layer — don't skip:

| Layer | Location |
|---|---|
| **Surfaces** | `apps/web` (Vite React), `apps/desktop` (Electron), `apps/mobile` (Capacitor iOS+Android), `apps/cli`, `apps/mcp` |
| **Core (shared logic)** | `packages/core` (`@notekit/core`) — stores, lib, crypto, components, hooks |
| **Transport client** | `packages/api-client` (`@notekit/api-client`) — must NOT import React/DOM |
| **Backend** | `apps/api` (+ `apps/backoffice` admin, `apps/landing` Next) |
| **Vault** | git-backed (GitHub/GitLab BYO or managed Forgejo), often E2EE |

Open in full lifecycle order with NO gaps:
`UI component/handler → store (zustand) → core lib → api-client → apps/api endpoint →
vault (git commit) → sync`. For actions, also verify parity in `apps/cli` + `apps/mcp`.

## Repo boundaries
- Edit freely in `packages/*` + `apps/*`. `apps/landing` (Next) & `apps/backoffice` have their
  own config/pipeline — respect that.
- **Do not touch `.claude/worktrees/**`** — those are other agents' worktrees (lint-ignored).
  Commit early / use an isolated worktree so your work isn't clobbered when another agent
  switches branches.

## Documentation — ONE centralized folder (MANDATORY)
**All documents** (design docs, plans, audits, session notes) MUST live in `docs/`. Do not
scatter new docs inside `apps/*/` or `packages/*/`. Naming: flat `YYYY-MM-DD-<kebab-name>.md`
at the root of `docs/`, or under an existing topic subfolder.

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
4. **Prefer consolidation.** Don't duplicate logic; unify it into a single helper in
   `@notekit/core`. A recurring pattern → record it in `docs/` + tidy it up.
5. **Put things in the right place + make them reusable.** Cross-cutting helpers (logger,
   gravatar, link-kind, file-paths, serialize, crypto, directory) → `@notekit/core`, never
   reimplemented per file/per surface (enforced by `@notekit/eslint-plugin/no-reinvent-core`).
   Architecture boundaries (enforced by `dependency-cruiser`): `@notekit/core` must **not**
   import `apps/*`; `@notekit/api-client` must **not** import React/DOM; no import cycles.
6. **No god-files.** Healthy target ≲ ~500 lines, hard ceiling 800 (ESLint `max-lines`,
   currently `warn` while the pre-existing backlog is burned down). Complexity budgets:
   cyclomatic & cognitive ≤ 15, function ≤ 80 lines, nesting ≤ 4, params ≤ 5. Over the limit =
   **extract a helper**, never `// eslint-disable`.
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
pnpm depcruise   # architecture boundaries
```
Local hooks: `pnpm hooks:install` (sets `core.hooksPath=scripts/hooks`). CI runs the same gates
on every PR + push to `main`.
