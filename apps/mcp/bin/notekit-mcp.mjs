#!/usr/bin/env node
// Thin launcher. The real entry is the bundled ESM in dist/. We re-import
// rather than re-implement the CLI so `notekit-mcp` and `node dist/index.js`
// behave identically.
import "../dist/index.js";
