# Stage 1: Prune monorepo to only what notekit-landing needs
FROM node:20-alpine AS pruner
RUN npm install -g turbo@^2
WORKDIR /app
COPY . .
RUN turbo prune notekit-landing --docker

# Stage 2: Install dependencies and build
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.5.0 --activate
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
WORKDIR /app/apps/landing
RUN pnpm build
RUN ls -la dist/server/ && echo "Build output verified"
# Create a flat (non-symlinked) production deployment so the runner
# stage doesn't need the pnpm virtual store.
WORKDIR /app
RUN pnpm --filter notekit-landing deploy --prod /app/prod-deploy

# Stage 3: Production runtime
FROM node:20-alpine AS runner
RUN apk add --no-cache wget
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 astro
WORKDIR /app
COPY --from=builder --chown=astro:nodejs /app/apps/landing/dist ./dist
COPY --from=builder --chown=astro:nodejs /app/prod-deploy/node_modules ./node_modules
COPY --from=builder --chown=astro:nodejs /app/prod-deploy/package.json ./package.json
USER astro
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/health || exit 1
CMD ["node", "./dist/server/entry.mjs"]
