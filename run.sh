#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

trap 'kill 0' EXIT

(cd backend && ./venv/bin/uvicorn main:app --reload --port 8000) &
(cd frontend && npm run dev) &

wait
