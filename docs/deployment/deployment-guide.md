# Deployment Guide

Two supported deployment paths ship with the repository: **Render** (`render.yaml` blueprint) and **Docker Compose on a Linux host** driven by the CD workflow.

## Production prerequisites

- Node.js 24.x and npm ≥ 10 (Render/native path)
- Docker + Docker Compose v2 (container path)
- MongoDB 6+ **as a replica set** (transactions are mandatory for booking holds) — MongoDB Atlas satisfies this
- TLS termination in front of the app (`AUTH_COOKIE_SECURE=true` refuses to boot otherwise)
- A secrets source: server-side `.env.production` (Compose) or the platform secret store (Render)

## Environment configuration

Copy `.env.example` and set at minimum:

```env
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://app.example.com

MONGODB_URI=mongodb+srv://…       # or the compose-built URI for the bundled mongodb service
JWT_SECRET=<random 32+ chars>
JWT_REFRESH_SECRET=<random 32+ chars>

AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAME_SITE=none        # cross-origin deployments; `lax` for same-origin

ADMIN_EMAIL=<real address>
ADMIN_PASSWORD=<strong unique password>

PAYMENT_PROVIDER=unselected       # or development_mock for test environments
PAYMENT_WEBHOOK_SECRET=<random>
LOG_LEVEL=info
LOG_FORMAT=json
MONGO_INITDB_ROOT_PASSWORD=<compose only>
MONGO_EXPRESS_PASSWORD=<compose only, for the tools profile>
```

Config validation refuses to start if a secret is too short, if `SameSite=none` is used without `Secure`, or if `NODE_ENV=production` runs without `AUTH_COOKIE_SECURE=true`.

## Path A — Docker Compose (CD workflow)

### What the CD pipeline does

`.github/workflows/cd.yml`, on push to `main` or a `v*.*.*` tag:

1. **verify** — fails unless CI (`ci.yml`) succeeded for that exact commit.
2. **build** — multi-stage images pushed to `ghcr.io/<owner>/pickleball-api` and `…/pickleball-web` (tags: branch, tag, SHA, `latest`), followed by a Trivy scan of the published image.
3. **deploy** — through the protected `staging`/`production` environment, SSH into the host and run:

   ```bash
   cd <DEPLOY_PATH>
   export API_IMAGE=ghcr.io/<owner>/pickleball-api:<version>
   export WEB_IMAGE=ghcr.io/<owner>/pickleball-web:<version>
   docker compose --env-file .env.production pull
   docker compose --env-file .env.production up -d --remove-orphans
   docker compose --env-file .env.production ps
   ```

4. **rollback** — if deployment fails, re-run compose with `vars.PREVIOUS_DEPLOY_TAG`.

### Required configuration

| Where               | Item                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| GitHub secrets      | `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`, `DEPLOY_PATH`, `DEPLOY_SSH_KEY`                     |
| GitHub variables    | `PREVIOUS_DEPLOY_TAG` (target of the rollback job)                                               |
| GitHub environments | `staging`, `production` — add required reviewers on `production`                                 |
| Server              | `.env.production` holding every secret above; never committed, never passed through the workflow |

### First deploy on a host

```bash
# 1. Place the compose artifacts in DEPLOY_PATH
# 2. Create .env.production (see Environment configuration)
# 3. Initial start — images come from GHCR (or build locally with --build)
API_IMAGE=ghcr.io/<owner>/pickleball-api:latest \
WEB_IMAGE=ghcr.io/<owner>/pickleball-web:latest \
docker compose --env-file .env.production up -d

# 4. Verify
docker compose ps
curl -fsS http://localhost:4000/api/v1/health     # api is bound to 127.0.0.1
curl -fsS http://localhost:8080/healthz           # web (nginx)
```

## Path B — Render

`render.yaml` defines a single Node web service (the static frontend deploys separately on Vercel — see the header above):

- **`pickleball-api`** (Node web service): `npm install --include=dev && npm run build:api` → `npm run start:api`; `PORT=10000`; `AUTH_COOKIE_SECURE=true`, `AUTH_COOKIE_SAME_SITE=none`; JWT secrets auto-generated; `MONGODB_URI` and `FRONTEND_URL` marked `sync: false` (set them in the dashboard).

Because the static site and API are separate origins, cookies require `SameSite=None; Secure` (already set by the blueprint) and `FRONTEND_URL` must match the site origin exactly (CORS allows only that origin).

## Post-deploy verification

1. `GET /api/v1/health` → `200` success envelope.
2. `GET /api/v1/health/detailed` → dependency diagnostics.
3. Sign in with the bootstrap admin (defaults recorded in `docs/admin-credentials.md` — **change `ADMIN_PASSWORD` first**).
4. `GET /api/v1/admin/database` → database diagnostics.
5. Booking smoke test: availability → hold → payment attempt (development environment) → confirm.
6. Confirm response headers: HSTS, CSP present, `X-Powered-By` absent, `X-Request-ID` present.

## Operational checklist

- [ ] Both JWT secrets are ≥ 32 chars, unique per environment, stored only in the secret store
- [ ] `ADMIN_PASSWORD` overridden from the `.env.example` default
- [ ] MongoDB is a replica set and `MONGODB_URI` uses auth + TLS
- [ ] `AUTH_COOKIE_SECURE=true` and TLS enforced at the proxy
- [ ] `FRONTEND_URL` exactly matches the deployed origin (CORS)
- [ ] `PAYMENT_PROVIDER` intentionally chosen; webhook secret set when a provider is live
- [ ] `LOG_FORMAT=json`, log shipping configured, alerts on `logger.error`/`logger.fatal`
- [ ] Notification outbox drained by a scheduler calling `processNotificationOutbox()` (or the admin endpoint)
- [ ] Indexes applied on staging first — production runs with `autoIndex` disabled
- [ ] Backups/PITR enabled on MongoDB; restore tested
- [ ] GitHub `production` environment requires reviewer approval
- [ ] `PREVIOUS_DEPLOY_TAG` maintained so rollback works

## Rollback

- **Compose/CD**: the `rollback` job redeploys `PREVIOUS_DEPLOY_TAG`; manually, set `API_IMAGE`/`WEB_IMAGE` to the previous tag and re-run `docker compose up -d`.
- **Render**: roll back to the previous deploy from the dashboard (or re-run with a previous commit).
- **Database**: schema changes must be backward-compatible with the previous release (expand → migrate → contract), because an API rollback does not revert collections.

## Troubleshooting

### `MODULE_NOT_FOUND .../apps/api/dist/server.js` at start

The build step failed to emit `dist/server.js`. With `NODE_ENV=production`, npm skips devDependencies by default, so `esbuild` (a devDependency) must be installed with `npm install --include=dev`. The `--include-dev` alias is not a valid npm flag and is silently ignored. Rebuild and confirm `dist/server.js` exists before starting.

| Symptom                                  | Action                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Container exits at boot with a Zod error | A required env var is missing/short — compare `.env.production` with `.env.example`          |
| `503 TRANSACTIONS_REQUIRED`              | MongoDB is not a replica set                                                                 |
| Web loads but API calls 404              | `VITE_API_URL` wrong, or the nginx `/api/` proxy cannot reach `api_upstream`                 |
| CORS errors from the browser             | `FRONTEND_URL` does not match the site origin; check `Secure`/`SameSite` cookie flags        |
| Deploy job fails after `up -d`           | `docker compose ps` + `docker compose logs api`; the rollback job restores the previous tag  |
| Health check timeouts                    | Hit `/api/v1/health` directly — the container `HEALTHCHECK` uses the same route              |
| Webhook rejected                         | Confirm the raw-body signature header (`payment-signature`) matches `PAYMENT_WEBHOOK_SECRET` |
