import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  output: 'standalone',
  // Monorepo: trace from the repo root so the standalone bundle includes
  // workspace-hoisted deps (fumadocs-ui, …). Without this the standalone server
  // 404s every route because the page modules can't resolve.
  outputFileTracingRoot: join(here, '../../'),
  reactStrictMode: true,
};

export default withMDX(config);
