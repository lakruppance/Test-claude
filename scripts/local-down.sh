#!/usr/bin/env bash
# Stops the local stack. Data (database, uploaded videos, Whisper model) is kept.
# Add --wipe to delete all local data.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${1:-}" = "--wipe" ]; then
  docker compose down -v
  npx -y supabase@2.119.0 stop --no-backup
else
  docker compose down
  npx -y supabase@2.119.0 stop
fi
