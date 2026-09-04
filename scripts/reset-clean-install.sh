#!/usr/bin/env bash
set -Eeuo pipefail

# Intentionally destructive: removes only this stack's volumes for a fresh installation.
if [[ "${RESET_ODIN_GO:-}" != "YES" ]]; then
  echo "Refusing reset. Run exactly: RESET_ODIN_GO=YES ./scripts/reset-clean-install.sh" >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$script_dir/.." && pwd)"

echo "Removing ODIN GO containers and volumes for a clean installation..."
docker compose -f "$project_dir/docker-compose.yml" down --volumes --remove-orphans
echo "Clean reset completed. Redeploy the stack; PostgreSQL will initialize an empty shiftplanner database."
