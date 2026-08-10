#!/usr/bin/env bash
# Modo desenvolvimento: backend na 8811 + Vite dev server na 5173 com hot reload.
# Abra http://127.0.0.1:5173 (o Vite faz proxy de /api para o backend).
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi

.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8811 --reload &
BACKEND_PID=$!
trap "kill $BACKEND_PID" EXIT

cd frontend-react
[ -d node_modules ] || npm install
npm run dev
