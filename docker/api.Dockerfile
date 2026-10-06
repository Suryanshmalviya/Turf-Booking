# syntax=docker/dockerfile:1
#
# Production image for @pickleball/api (Express + Mongoose).
#
# ALWAYS build from the repository root so the npm workspace tree is in context:
#
#   docker build -f docker/api.Dockerfile -t pickleball-api:local .
#
# Stages:
#   base       shared base image
#   prod-deps  runtime-only install for the API workspace
#   deps       full workspace install (esbuild/typescript are dev deps)
#   build      compiles src/server.ts into dist/server.js via esbuild
#   runtime    node:alpine, non-root, dist + production node_modules only
#
# SECURITY: no secret is ever baked into this image. Every value (MONGODB_URI,
# JWT_SECRET, JWT_REFRESH_SECRET, PAYMENT_WEBHOOK_SECRET, ADMIN_PASSWORD, ...)
# must be supplied at run time via `docker compose`, `docker run -e`, or a
# mounted env file. `.dockerignore` also blocks `.env*` from the build context.

ARG NODE_VERSION=20.18.1

# ─── base ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# `dumb-init` gives Node a real PID 1 so SIGTERM reaches the process and the
# graceful shutdown handlers can close the HTTP server and the Mongo connection.
# Deliberately not version-pinned: the available Alpine revision floats with the
# base image, and pinning a specific `=X.Y.Z-rN` breaks the build whenever the
# repository bumps it (this happened with `=1.2.5-r2`).
RUN apk add --no-cache dumb-init

# ─── prod-deps ───────────────────────────────────────────────────────────────
# Only manifests are copied so this layer is reused when source changes.
# All workspace manifests must exist because package-lock.json describes all
# of them.
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace=apps/api --include-workspace-root

# ─── deps ────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
# `--include=dev` is mandatory: base sets NODE_ENV=production, which makes npm
# skip devDependencies by default — but esbuild and typescript (used by the
# build stage below) are dev deps. Without this flag the build stage fails
# with `esbuild: not found` (exit code 127).
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev

# ─── build ───────────────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
# `npm run build:api` -> esbuild bundle to apps/api/dist/server.js.
RUN npm run build:api \
    && test -f apps/api/dist/server.js

# ─── runtime ─────────────────────────────────────────────────────────────────
FROM base AS runtime

ENV PORT=4000 \
    API_VERSION=v1 \
    NODE_OPTIONS=--enable-source-maps

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
# @pickleball/shared is a workspace dependency linked into node_modules by npm.
# Its sources are inlined by esbuild, but copying the directory keeps the
# workspace symlink resolvable.
COPY --from=build --chown=node:node /app/packages/shared ./packages/shared

USER node
WORKDIR /app/apps/api
EXPOSE 4000

# Liveness probe against the documented health route. `$$PORT` is escaped so the
# shell inside the container expands it at probe time rather than build time.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --quiet --tries=1 --spider "http://127.0.0.1:$${PORT:-4000}/api/v1/health" || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
