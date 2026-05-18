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

# VITE_API_URL is baked into the bundle at build time
ARG VITE_API_URL=https://api.notekit.app
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app/packages/web
RUN pnpm build

# Stage 3: Serve with nginx
FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost/health || exit 1
