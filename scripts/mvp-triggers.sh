#!/usr/bin/env bash
# Manual MVP: call prompt broadcast, then (after you submit the form) call generate.
# Usage:
#   BASE_URL=http://localhost:3000 CRON_SECRET=your-secret ./scripts/mvp-triggers.sh prompt
#   BASE_URL=https://your-app.vercel.app CRON_SECRET=your-secret ./scripts/mvp-triggers.sh generate
#   BASE_URL=... CRON_SECRET=... ./scripts/mvp-triggers.sh both
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
BASE_URL="${BASE_URL%/}"

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "error: set CRON_SECRET in the environment" >&2
  exit 1
fi

AUTH_HEADER="Authorization: Bearer ${CRON_SECRET}"

prompt() {
  echo "GET ${BASE_URL}/api/cron/prompt"
  curl -sS -f -H "${AUTH_HEADER}" "${BASE_URL}/api/cron/prompt"
  echo
}

generate() {
  echo "GET ${BASE_URL}/api/cron/generate?trigger=manual"
  curl -sS -f -H "${AUTH_HEADER}" "${BASE_URL}/api/cron/generate?trigger=manual"
  echo
}

case "${1:-both}" in
  prompt)
    prompt
    ;;
  generate)
    generate
    ;;
  both)
    prompt
    echo ""
    echo "Open DISPATCH_APP_URL in a browser, submit the form, then run:"
    echo "  BASE_URL=${BASE_URL} CRON_SECRET=... ./scripts/mvp-triggers.sh generate"
    ;;
  *)
    echo "usage: $0 [prompt|generate|both]" >&2
    exit 1
    ;;
esac
