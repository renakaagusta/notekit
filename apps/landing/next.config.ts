import path from 'path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // In a pnpm monorepo, standalone traces files relative to the repo root
  // so server.js ends up at standalone/apps/landing/server.js (not at an
  // absolute-path-mirrored subdirectory). Dockerfile WORKDIR must match.
  outputFileTracingRoot: path.join(__dirname, '../../'),
}

export default nextConfig
