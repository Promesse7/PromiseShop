#!/bin/sh
set -e

python manage.py collectstatic --noinput
# Migrations need a direct (non-pooled) connection — PgBouncer's transaction
# mode used by DATABASE_URL doesn't support the session-level operations
# schema migrations rely on. Falls back to DATABASE_URL when unset (e.g. local
# docker-compose Postgres, which isn't pooled to begin with).
DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" python manage.py migrate --noinput

exec gunicorn config.wsgi:application \
    --bind "0.0.0.0:${PORT:-8000}" \
    --workers "${WEB_CONCURRENCY:-3}" \
    --timeout 120
