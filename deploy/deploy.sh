#!/usr/bin/env bash
# Build, migrate and (re)start the production stack. Run from the repo root:
#   ./deploy/deploy.sh          deploy / update
#   ./deploy/deploy.sh --seed   first deploy: also create the admin account
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Missing .env - run: cp .env.production.example .env and fill it in"; exit 1; }
if grep -q CHANGE_ME .env; then echo "Replace every CHANGE_ME in .env first"; exit 1; fi

compose="docker compose -f docker-compose.prod.yml"
$compose build
$compose up -d postgres redis
$compose run --rm api sh -c "cd /app && pnpm --filter @digisoft/db migrate:deploy"
if [ "${1:-}" = "--seed" ]; then
  $compose run --rm api sh -c "cd /app && pnpm --filter @digisoft/db seed"
fi
$compose up -d
$compose ps
