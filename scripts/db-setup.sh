#!/usr/bin/env bash
# Local-only post-setup: applies Realtime authorization policies as supabase_admin.
# Re-run this after `supabase db reset` if the migration logged a skip notice.
set -euo pipefail

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_pos-kds}"
SQL_FILE="$(cd "$(dirname "$0")/.." && pwd)/supabase/realtime_policies.sql"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Container $CONTAINER not found. Run \`npm run db:start\` first." >&2
  exit 1
fi

docker exec -i "$CONTAINER" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < "$SQL_FILE"
echo "Realtime policies applied."
