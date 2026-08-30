FROM node:20-alpine AS pruner
RUN npm install -g turbo@^2
WORKDIR /app
COPY . .
RUN turbo prune notekit-design --docker

FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.5.0 --activate
WORKDIR /app
# Full source (incl. source.config.ts, token DTCG sources) before install so the
# fumadocs-mdx postinstall and the token build both have what they need.
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
# Compile @notekit/tokens → dist before building the site that imports it.
RUN pnpm --filter @notekit/tokens build
WORKDIR /app/apps/design
RUN pnpm build

FROM node:20-alpine AS runner
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
WORKDIR /app
# Owned by the runtime user: Next 16 writes its segment/prerender cache under
# .next/server at request time, so these trees must be writable by `nextjs`.
COPY --from=builder --chown=nextjs:nodejs /app/apps/design/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/design/.next/static ./apps/design/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/design/public ./apps/design/public
USER nextjs
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["node", "apps/design/server.js"]
