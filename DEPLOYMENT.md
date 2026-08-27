# Deploying to Vercel

This repo is a monorepo with two Vercel Services defined in `vercel.json`:

- **frontend-ui** (`frontend/`) — Next.js app, deployed normally by Vercel's framework detection.
- **backend-api** (`backend/`) — Django/DRF API, built from `backend/Dockerfile.vercel` and run as a container.

The frontend never calls the backend from the browser. All API calls go through
Next.js server routes (`frontend/app/api/proxy/**`, `frontend/app/api/auth/**`),
which forward requests server-to-server to `DJANGO_API_URL`. Because of that,
`vercel.json` only routes public traffic to `frontend-ui`; the backend service
is reached via its own Vercel-assigned URL, not the custom domain.

## What changed in this pass

- `backend/Dockerfile.vercel` + `backend/entrypoint.sh` — production container:
  runs `collectstatic`, runs `migrate`, then serves with `gunicorn` bound to
  `$PORT` (Vercel injects this at runtime).
- `backend/requirements.txt` — added `gunicorn` and `whitenoise`.
- `backend/config/settings.py`:
  - `DATABASE_URL` support (via `django-environ`) for managed Postgres,
    falling back to the existing `POSTGRES_*` vars so local docker-compose is
    unaffected.
  - `whitenoise` for serving static/admin assets from the container.
  - `DJANGO_CSRF_TRUSTED_ORIGINS`, `SECURE_PROXY_SSL_HEADER`, and
    `USE_X_FORWARDED_HOST` for running correctly behind Vercel's TLS-terminating proxy.
- `vercel.json` — declares both services; all public traffic routes to `frontend-ui`.
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
   `vercel.json` and create both services.

## Environment variables to set in Vercel

**backend-api:**
| Var | Value |
|---|---|
| `DJANGO_SECRET_KEY` | a new random secret (do not reuse the dev one) |
| `DJANGO_DEBUG` | `False` |
| `DJANGO_ALLOWED_HOSTS` | the backend service's `*.vercel.app` domain |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://<backend-service>.vercel.app` |
| `DATABASE_URL` | pooled connection string, Neon `production` branch (see above) |
| `DATABASE_URL_UNPOOLED` | direct connection string, Neon `production` branch — used only for `migrate` (see `entrypoint.sh`) |
| `REDIS_URL` | from Upstash (`rediss://...`) |

**frontend-ui:**
| Var | Value |
|---|---|
| `DJANGO_API_URL` | `https://<backend-service>.vercel.app/api` (find the exact URL Vercel assigns to `backend-api` in the dashboard after first deploy) |

After the first deploy, check the actual URL Vercel gave `backend-api` and
update `DJANGO_API_URL` on `frontend-ui` to match, then redeploy the frontend.

## Known limitations (carried over from Vercel's container model)

- No background workers/cron inside the container — this app doesn't use any today.
- `migrate` runs automatically on every container start (see `entrypoint.sh`).
  For a single-instance deploy this is fine; if Vercel ever cold-starts
  multiple backend instances concurrently, simultaneous `migrate` runs are a
  known (small) race — for a bigger app you'd move this to a separate release
  step instead.
