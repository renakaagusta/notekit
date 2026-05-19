#!/usr/bin/env node
// Thin shim. The real entry is the bundled ESM file produced by `tsup`.
// For development, run `pnpm --filter @notekit/cli dev -- <args>` which uses tsx
// directly against src/index.ts.
import("../dist/index.js").catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
