# Deploying to Vercel

This repo is a single Vercel project using [Vercel Services](https://vercel.com/docs/services),
with two services defined in `vercel.json`:

- **frontend-ui** (`frontend/`) — Next.js app, the only service exposed to the
  public internet (the top-level `rewrites` rule routes all traffic to it).
- **backend-api** (`backend/`) — Django/DRF API, built as a container from
  `backend/Dockerfile.vercel` (`runtime: "container"`, `entrypoint`). It has no
  rewrite of its own, so it is **not** publicly reachable at all — only
  `frontend-ui` can reach it, over an internal service binding.

The frontend never calls the backend from the browser. All API calls go through
Next.js server routes (`frontend/app/api/proxy/**`, `frontend/app/api/auth/**`),
which forward requests server-to-server. Those routes read the backend's base
URL from `getDjangoApiUrl()` (`frontend/lib/backend-url.ts`), which prefers
`DJANGO_API_URL` (local dev / `.env.local`) and otherwise falls back to
`BACKEND_INTERNAL_URL` — the URL Vercel auto-injects into `frontend-ui` via the
`bindings` entry in `vercel.json` (a bare origin, so `/api` is appended in
code). You never set `BACKEND_INTERNAL_URL` yourself; Vercel generates and
injects it per-deployment (including previews) once the binding is declared.

## What changed in this pass

- `backend/Dockerfile.vercel` + `backend/entrypoint.sh` — production container:
  runs `collectstatic`, runs `migrate` over the direct/unpooled DB connection,
  then serves with `gunicorn` bound to `$PORT` (Vercel injects this at runtime).
- `backend/requirements.txt` — added `gunicorn` and `whitenoise`.
- `backend/config/settings.py`:
  - `DATABASE_URL` support (via `django-environ`) for managed Postgres,
    falling back to the existing `POSTGRES_*` vars so local docker-compose is
    unaffected.
  - `whitenoise` for serving static/admin assets from the container.
  - `DJANGO_CSRF_TRUSTED_ORIGINS`, `SECURE_PROXY_SSL_HEADER`, and
    `USE_X_FORWARDED_HOST` for running correctly behind Vercel's TLS-terminating proxy.
- `vercel.json` — declares both services as one Vercel Services project;
  `backend-api` builds as a container and is bound (not publicly routed) to
  `frontend-ui`, which is the sole public entry point.
- `frontend/lib/backend-url.ts` — resolves the Django API base URL from either
  `DJANGO_API_URL` or the injected `BACKEND_INTERNAL_URL` binding.
- Removed a stray nested git repo at `frontend/.git` (a second, out-of-date
  clone of this project) so the repo root is the single source of truth.

## Before you deploy

1. **Push this repo to GitHub** (the root, not just `frontend/`) — the root
   repo currently has no remote configured:
   ```
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
   Note: the old `frontend/.git` pointed at `github.com/Promesse7/PromiseShop`
   with a single stale commit — if you reuse that GitHub repo, you'll need to
   force-push the root repo's history over it.

2. **Provision managed services** (Vercel's containers are stateless/ephemeral —
   local SQLite/files or a Redis running only in the container will not survive
   a restart or scale event):
   - Postgres: this repo is already wired to Neon project `PromiseShop`
     (`mute-frog-75557092`, org `Promesse`). Point production at the `production`
     branch — get both connection strings with:
     ```
     neon connection-string production            # pooled -> DATABASE_URL
     neon connection-string production --unpooled  # direct -> DATABASE_URL_UNPOOLED
     ```
     Local dev uses its own `development` branch instead (see `.neon` /
     `neon checkout`), so day-to-day work never touches the `production` branch.
   - Redis: e.g. [Upstash](https://upstash.com) → gives a `rediss://...` URL.

3. **Import the repo in Vercel** (Add New → Project). It should detect
   `vercel.json`'s `services` key and set the project's framework to
   "Services," creating both `frontend-ui` and `backend-api`.

## Environment variables to set in Vercel

Vercel Services share one project, but env vars are still set per-service in
the dashboard.

**backend-api:**
| Var | Value |
|---|---|
| `DJANGO_SECRET_KEY` | a new random secret (do not reuse the dev one) |
| `DJANGO_DEBUG` | `False` |
| `DJANGO_ALLOWED_HOSTS` | the project's `*.vercel.app` domain (there's only one domain now — see note below) |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://<project>.vercel.app` |
| `DATABASE_URL` | pooled connection string, Neon `production` branch (see above) |
| `DATABASE_URL_UNPOOLED` | direct connection string, Neon `production` branch — used only for `migrate` (see `entrypoint.sh`) |
| `REDIS_URL` | from Upstash (`rediss://...`) |

**frontend-ui:**

Nothing to set. `BACKEND_INTERNAL_URL` is injected automatically by the
`bindings` entry in `vercel.json` — do not add it manually in the dashboard,
Vercel generates and manages this value per-deployment.

> **Note on `DJANGO_ALLOWED_HOSTS`:** internal binding calls route through the
> same layer as public requests, so the Host header should match the
> project's own domain — but this hasn't been verified against a real
> deployment yet. If backend calls fail with Django's `DisallowedHost` error
> after the first deploy, check the backend-api function logs for the actual
> Host header used and add it to `DJANGO_ALLOWED_HOSTS`.

## Known limitations (carried over from Vercel's container model)

- No background workers/cron inside the container — this app doesn't use any today.
- `migrate` runs automatically on every container start (see `entrypoint.sh`).
  For a single-instance deploy this is fine; if Vercel ever cold-starts
  multiple backend instances concurrently, simultaneous `migrate` runs are a
  known (small) race — for a bigger app you'd move this to a separate release
  step instead.
