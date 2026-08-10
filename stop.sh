#!/usr/bin/env bash
# Encerra os processos do backend (uvicorn) e frontend (vite)
cd "$(dirname "$0")"
pkill -f uvicorn 2>/dev/null || true
pkill -f vite 2>/dev/null || true
echo "🛑 Processos do betteropenproject encerrados com sucesso."
