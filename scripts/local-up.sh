#!/usr/bin/env bash
# Starts the whole stack locally: Supabase (DB + API), S3 storage, the worker, then the web app.
# Requirements: Docker (running) and Node.js 20+. First run downloads several GB of images.
set -euo pipefail
cd "$(dirname "$0")/.."

SUPABASE="npx -y supabase@2.119.0"

command -v docker >/dev/null || { echo "Docker is required: https://docs.docker.com/get-docker/"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is installed but not running. Start Docker Desktop and retry."; exit 1; }
command -v node >/dev/null || { echo "Node.js 20+ is required: https://nodejs.org"; exit 1; }
node -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)' || { echo "Node.js 20+ is required."; exit 1; }

echo "==> Starting Supabase (database, auth, API)..."
$SUPABASE start -x studio,imgproxy,vector,logflare,edge-runtime,supavisor,storage-api
$SUPABASE migration up --local >/dev/null

echo "==> Writing local settings..."
node scripts/local-env.mjs "$($SUPABASE status -o json 2>/dev/null)"

echo "==> Starting storage and worker (first build takes a few minutes)..."
docker compose up -d --build
# Recreate the worker so edits to .env.local (API keys, providers) always apply.
docker compose up -d --no-deps --force-recreate worker

echo -n "==> Waiting for the worker"
for _ in $(seq 1 60); do
  if curl -fsS http://localhost:8787/health >/dev/null 2>&1; then echo " ok"; break; fi
  echo -n "."; sleep 2
done
curl -fsS http://localhost:8787/health >/dev/null || { echo; echo "Worker did not start. See: docker compose logs worker"; exit 1; }

echo "==> Installing web dependencies..."
(cd apps/web && { [ -d node_modules ] || npm ci; })

echo
echo "Ready. Open http://localhost:3000 once the web server below is up."
echo "Confirmation and password-reset emails land in the local mailbox: http://localhost:54324"
echo "Make yourself admin: node scripts/make-admin.mjs you@example.com"
echo "Stop everything later with: scripts/local-down.sh"
echo
cd apps/web && exec npm run dev
