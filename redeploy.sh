#!/usr/bin/env bash
# Rebuilda o frontend React e reinicia o serviço systemd (produção background).
# Uso: ./redeploy.sh
set -e
cd "$(dirname "$0")"

echo "==> Buildando frontend React..."
cd frontend-react
npm install --silent
npm run build
cd ..

echo "==> Reiniciando serviço systemd..."
sudo systemctl restart openassistent

echo "==> Status:"
sudo systemctl status openassistent --no-pager -l
