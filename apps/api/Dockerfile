# Stage 1: Prune monorepo to only what @notekit/api needs
FROM node:20-alpine AS pruner
RUN npm install -g turbo@^2
WORKDIR /app
COPY . .
RUN turbo prune @notekit/api --docker

# Stage 2: Install dependencies
FROM node:20-alpine AS installer
RUN corepack enable && corepack prepare pnpm@9.5.0 --activate
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# Stage 3: Runtime — run TypeScript directly with tsx (no compile step needed)
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.5.0 --activate
RUN addgroup --system --gid 1001 api && adduser --system --uid 1001 apiuser
WORKDIR /app

COPY --from=installer --chown=apiuser:api /app .

# SQLite data directory (mounted as a volume in production)
RUN mkdir -p /app/apps/api/data && chown apiuser:api /app/apps/api/data

USER apiuser
ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["pnpm", "start"]
