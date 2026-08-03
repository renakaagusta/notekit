# ── Stage 1: Prune workspace to only what apps/backoffice needs ───────────────
FROM node:20-alpine AS pruner
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable && corepack prepare pnpm@9.5.0 --activate
WORKDIR /app
RUN pnpm add -g turbo@latest
COPY . .
RUN turbo prune @notekit/backoffice --docker

# ── Stage 2: Install deps + build ─────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.5.0 --activate
WORKDIR /app

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
COPY turbo.json turbo.json

ARG VITE_API_URL=https://api.notekit.online
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm turbo run build --filter=@notekit/backoffice

# Fail the build if the API URL didn't make it into the bundle (Vite only
# substitutes literal import.meta.env.VITE_API_URL — see prod-bundle memory).
RUN grep -rq "$VITE_API_URL" /app/apps/backoffice/dist/assets || \
    (echo "VITE_API_URL not found in bundle!" && exit 1)

# ── Stage 3: Serve with Nginx ─────────────────────────────────────────────────
FROM nginx:alpine AS runner
COPY --from=builder /app/apps/backoffice/dist /usr/share/nginx/html
COPY apps/backoffice/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
