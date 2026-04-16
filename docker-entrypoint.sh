#!/bin/sh
set -eu

rm -rf .next

npm run build
exec npm start -- --hostname "${HOSTNAME:-0.0.0.0}" --port "${PORT:-3000}"
