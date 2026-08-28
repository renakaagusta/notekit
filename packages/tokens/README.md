# @notekit/tokens

Single source of truth for NoteKit's design tokens.

Tokens are authored in the [W3C Design Tokens (DTCG) format](https://www.designtokens.org/)
under `src/*.tokens.json` and compiled by [Style Dictionary](https://styledictionary.com/)
(`build.mjs`) into:

- `dist/tokens.json` — flat, machine-readable catalogue (rendered by `design.notekit.online`
  and consumable by agents).
- `dist/css/variables.css` — canonical `--nk-*` custom properties under `:root`.
- `dist/css/core.css` — the same tokens emitted under `packages/core`'s own variable names
  (`[data-theme]`, `.nk`), so core can adopt the token package via aliases with zero visual
  diff (migration Stage 2).

## Build

```bash
pnpm --filter @notekit/tokens build
```

## Rules

- Never hand-edit the CSS/JSON in `dist/` — edit the DTCG sources and rebuild.
- Adding a platform (native iOS/Android export, Tailwind preset) means adding a Style
  Dictionary platform here, never a parallel token store elsewhere.
- Consuming surfaces (apps/*, other packages) read the compiled output. This package imports
  nothing from `apps/*` — it is pure data + a build step (inward-only dependency rule).
