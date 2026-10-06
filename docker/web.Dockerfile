# syntax=docker/dockerfile:1
#
# Production image for @pickleball/web (React SPA built with Vite).
#
# ALWAYS build from the repository root so the npm workspace tree is in context:
#
#   docker build -f docker/web.Dockerfile -t pickleball-web:local .
#
# Stages:
#   deps    full workspace install (tsc and vite are dev dependencies)
#   build   runs `tsc && vite build`, emitting apps/web/dist
#   runtime nginx serves the static bundle and reverse-proxies /api to the API
#
# VITE_API_URL is a BUILD-TIME value because Vite inlines import.meta.env.
# The default is the same-origin `/api/v1`, which nginx proxies to the API
# container, so no environment-specific URL is baked into the image. Override
# only for split-origin deployments:
#
#   docker build -f docker/web.Dockerfile --build-arg VITE_API_URL=https://api.example.com/api/v1 .

ARG NODE_VERSION=20.18.1
ARG NGINX_VERSION=1.27.3-alpine

# ─── deps ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false
# All workspace manifests must be present because package-lock.json covers them.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ─── build ───────────────────────────────────────────────────────────────────
FROM deps AS build
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL} \
    NODE_ENV=production

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY apps/web ./apps/web

# `npm run build:web` -> `tsc && vite build`.
RUN npm run build:web \
    && test -f apps/web/dist/index.html

# ─── runtime ─────────────────────────────────────────────────────────────────
FROM nginx:${NGINX_VERSION} AS runtime

# The official nginx image renders every /etc/nginx/templates/*.template through
# envsubst at container start. That is how the API upstream host/port is
# injected from environment variables instead of being hard-coded in the image.
ENV API_UPSTREAM_HOST=api \
    API_UPSTREAM_PORT=4000 \
    NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d \
    NGINX_ENVSUBST_FILTER=^API_UPSTREAM_

# NGINX_ENVSUBST_FILTER above is restricted to API_UPSTREAM_* so that nginx
# runtime variables ($uri, $host, $remote_addr, ...) inside the rendered config
# survive the envsubst pass untouched.

# `docker/nginx.conf` is a plain file, not a nested template: envsubst only
# substitutes ${API_UPSTREAM_*} (see NGINX_ENVSUBST_FILTER above), so nginx
# runtime variables like $uri and $host survive the render pass.
COPY docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build --chown=nginx:nginx /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/healthz || exit 1

STOPSIGNAL SIGQUIT
