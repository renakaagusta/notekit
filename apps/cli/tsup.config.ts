import { defineConfig } from "tsup";

// Bundle the CLI as a single ESM file so the bin shim can `import('../dist/index.js')`.
// We keep workspace packages external — they ship as TypeScript source and are
// resolved by Node through pnpm's symlinks at runtime, but tsup will transpile
// what it needs. Native deps like @napi-rs/keyring stay external.
export default defineConfig({
  entry: { index: "src/index.ts" },
  outDir: "dist",
  format: ["esm"],
  target: "node20",
  platform: "node",
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  shims: false,
  // We want a usable single-file build; bundle workspace deps so a future
  // `npm i -g` (or `bun build --compile`) works without pulling pnpm
  // symlinks. @notekit/mcp is here so `notekit mcp serve` can launch the
  // MCP server in-process (no spawn) from the Bun-compiled binary.
  noExternal: ["@notekit/api-client", "@notekit/core", "@notekit/mcp"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
