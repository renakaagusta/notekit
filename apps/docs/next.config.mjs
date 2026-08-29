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
  // The docs were reorganized into Diátaxis sections (get-started / guides /
  // how-it-works / reference). Keep the old URLs alive so bookmarks and external
  // links don't 404.
  async redirects() {
    return [
      { source: '/getting-started', destination: '/get-started/quickstart', permanent: true },
      { source: '/concepts', destination: '/how-it-works', permanent: true },
      { source: '/concepts/vault', destination: '/how-it-works/the-vault', permanent: true },
      { source: '/concepts/encryption', destination: '/how-it-works/encryption', permanent: true },
      { source: '/security', destination: '/how-it-works', permanent: true },
      { source: '/security/key-hierarchy', destination: '/reference/cryptography', permanent: true },
      { source: '/security/content-encryption', destination: '/how-it-works/encryption', permanent: true },
      { source: '/security/envelope-encryption', destination: '/how-it-works/encryption', permanent: true },
      { source: '/security/devices-and-pairing', destination: '/how-it-works/devices-and-trust', permanent: true },
      { source: '/security/sharing-and-revocation', destination: '/how-it-works/sharing-and-revocation', permanent: true },
      { source: '/security/threat-model', destination: '/how-it-works/threat-model', permanent: true },
      { source: '/architecture', destination: '/how-it-works/architecture', permanent: true },
      { source: '/architecture/surfaces', destination: '/reference/surfaces', permanent: true },
      { source: '/architecture/data-flow', destination: '/how-it-works/data-flow', permanent: true },
      { source: '/architecture/zero-knowledge', destination: '/how-it-works/zero-knowledge', permanent: true },
      { source: '/mcp', destination: '/guides/connect-an-agent', permanent: true },
      { source: '/mcp/tools', destination: '/reference/mcp-tools', permanent: true },
      { source: '/cli', destination: '/guides/use-the-cli', permanent: true },
      { source: '/self-hosting', destination: '/guides/self-host', permanent: true },
    ];
  },
};

export default withMDX(config);
