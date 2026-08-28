#!/bin/sh
set -e

python manage.py collectstatic --noinput
# Migrations need a direct (non-pooled) connection — PgBouncer's transaction
# mode used by DATABASE_URL doesn't support the session-level operations
# schema migrations rely on. Falls back to DATABASE_URL when unset (e.g. local
# docker-compose Postgres, which isn't pooled to begin with).
DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" python manage.py migrate --noinput

# WSGI can't read a chunked-transfer request body without an upfront
# Content-Length, which Vercel's internal service-binding proxy strips in
# favor of Transfer-Encoding: chunked — so requests routed through it (e.g.
# the frontend's server-side fetch to this service) arrive with an empty
# body under gunicorn's sync WSGI worker. ASGI streams the body instead.
exec gunicorn config.asgi:application \
    -k uvicorn_worker.UvicornWorker \
    --bind "0.0.0.0:${PORT:-8000}" \
    --workers "${WEB_CONCURRENCY:-3}" \
    --timeout 120
