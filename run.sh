#!/usr/bin/env bash
# Builda o frontend React (se preciso) e sobe o backend em http://127.0.0.1:8811
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ] || [ ! -f .venv/bin/uvicorn ]; then
  python3 -m venv .venv
  [ -f .venv/bin/pip ] || (curl -sSL https://bootstrap.pypa.io/get-pip.py | .venv/bin/python)
  .venv/bin/pip install -q -r requirements.txt
fi

if [ ! -d frontend-react/dist ] || [ "$1" = "--build" ]; then
  echo "Buildando frontend React..."
  (cd frontend-react && npm install --silent && npm run build)
fi

exec .venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8811
