#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then
  umask 077
  cp .env.example .env
fi
npm ci --no-audit --no-fund
npm run db:generate
docker compose up -d --wait
npm run db:migrate
npm run db:seed
npm run build
