#!/usr/bin/env bash
set -Eeuo pipefail

# Repairs credentials in an existing PostgreSQL volume. It never removes data.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
if [[ -f "$PROJECT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$PROJECT_DIR/.env"
  set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"

if [[ "$POSTGRES_USER" != "shiftplanner_app" || "$POSTGRES_DB" != "shiftplanner" ]]; then
  echo "Refusing repair: expected shiftplanner_app / shiftplanner." >&2
  exit 1
fi

echo "Checking PostgreSQL container..."
docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T postgres \
  pg_isready -U "$POSTGRES_USER" -d postgres >/dev/null

docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T \
  postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
  -v repair_password="$DB_PASSWORD" \
  -c "SELECT format('CREATE DATABASE %I OWNER %I', 'shiftplanner', 'shiftplanner_app') WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'shiftplanner')\\gexec" \
  -c "ALTER ROLE \"shiftplanner_app\" WITH LOGIN PASSWORD :'repair_password';" \
  -c "ALTER DATABASE \"shiftplanner\" OWNER TO \"shiftplanner_app\";" \
  -c "GRANT ALL PRIVILEGES ON DATABASE \"shiftplanner\" TO \"shiftplanner_app\";" \
  -c "GRANT ALL ON SCHEMA public TO \"shiftplanner_app\";" \
  >/dev/null

echo "Database password and ownership repaired successfully (volume preserved)."
