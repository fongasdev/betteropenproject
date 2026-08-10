#!/usr/bin/env bash
# Sobe o modo desenvolvimento (Hot Reload no backend e frontend) em background.
# Logs são salvos em dev.log.
cd "$(dirname "$0")"

# Para instâncias anteriores se estiverem rodando
pkill -f uvicorn 2>/dev/null || true
pkill -f vite 2>/dev/null || true

nohup ./dev.sh > dev.log 2>&1 &

echo "🚀 Servidor em modo desenvolvimento (Hot Reload) iniciado em background!"
echo "   - Frontend (React + HMR): http://127.0.0.1:5173"
echo "   - Backend (FastAPI --reload): http://127.0.0.1:8811"
echo "   - Ver logs em tempo real: tail -f dev.log"
echo "   - Para parar o servidor: ./stop.sh"
