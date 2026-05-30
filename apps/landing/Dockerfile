# Minimal static landing page served on the apex (notekit.online).
# The actual app lives at app.notekit.online (apps/web). No build step —
# just copy the static HTML into nginx.
FROM nginx:1.27-alpine AS runner
COPY apps/landing/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/landing/index.html /usr/share/nginx/html/index.html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost/health || exit 1
