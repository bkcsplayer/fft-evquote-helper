#!/bin/sh
set -e

wait_for_db() {
  if [ -z "${DB_HOST:-}" ]; then
    return 0
  fi

  echo "Waiting for database at ${DB_HOST}:${DB_PORT:-5432} ..."
  tries=60
  while [ $tries -gt 0 ]; do
    python - <<'PY'
import os, sys
import psycopg2

host = os.environ.get("DB_HOST")
port = int(os.environ.get("DB_PORT", "5432"))
user = os.environ.get("DB_USER")
password = os.environ.get("DB_PASSWORD")
dbname = os.environ.get("DB_NAME")

try:
    conn = psycopg2.connect(host=host, port=port, user=user, password=password, dbname=dbname, connect_timeout=2)
    conn.close()
except Exception:
    sys.exit(1)
PY
    if [ $? -eq 0 ]; then
      echo "Database is ready."
      return 0
    fi
    tries=$((tries - 1))
    sleep 1
  done

  echo "Database not reachable after timeout."
  return 1
}

wait_for_db

echo "Running migrations..."
alembic upgrade head

echo "Starting app..."
exec "$@"

