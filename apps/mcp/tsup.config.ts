import { defineConfig } from "tsup";

// Bundles the MCP server into a single ESM file under dist/. The shebang
// banner makes `dist/index.js` directly executable, so `bin/notekit-mcp.mjs`
// can simply import it.
//
// Workspace packages ship as TypeScript source (no build step), so we
// `noExternal` them — otherwise Node would try to import the raw `.ts` files
// at runtime and crash with ERR_UNKNOWN_FILE_EXTENSION.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  noExternal: ["@notekit/api-client", "@notekit/core"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
