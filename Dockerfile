# Build do frontend React
FROM node:20-slim AS frontend
WORKDIR /app/frontend-react
COPY frontend-react/package.json frontend-react/package-lock.json ./
RUN npm ci
COPY frontend-react/ .
RUN npm run build

# Backend FastAPI servindo API + o build do frontend (same-origin: sem CORS
# cross-site, cookie de sessão funciona igual ao ambiente local)
FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ backend/
COPY --from=frontend /app/frontend-react/dist frontend-react/dist

ENV PORT=8811
EXPOSE 8811
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
