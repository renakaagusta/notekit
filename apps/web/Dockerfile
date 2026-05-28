# Stage 1: Prune monorepo to only what @notekit/web needs
FROM node:20-alpine AS pruner
RUN npm install -g turbo@^2
WORKDIR /app
COPY . .
RUN turbo prune @notekit/web --docker

# Stage 2: Install dependencies and build
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.5.0 --activate
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json

# VITE_API_URL is baked into the bundle at build time
ARG VITE_API_URL=https://api.notekit.app
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app/apps/web
RUN pnpm build

# Verify the API URL we asked for actually made it into the bundle.
# A stale buildx cache or a regression in api.ts (optional-chain access that
# defeats Vite's static substitution) can both silently produce a bundle
# baked with the localhost fallback — at which point prod users see a
# permanent loading skeleton on the sign-in page. Fail the build instead
# of shipping that.
RUN grep -qF "$VITE_API_URL" dist/assets/index-*.js \
  || (echo "ERROR: VITE_API_URL ($VITE_API_URL) not found in built bundle. \
Likely causes: stale buildx cache (rm /tmp/.buildx-cache-web on the runner) \
or api.ts uses indirect import.meta.env access that defeats Vite substitution." \
  && exit 1)

# Stage 3: Serve with nginx
FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost/health || exit 1
