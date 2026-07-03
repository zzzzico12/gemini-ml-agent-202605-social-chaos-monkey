FROM node:20-slim AS frontend-build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js .env.production ./
COPY index.jsx index.css Dashboard.jsx ./
RUN npm run build

FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY --from=frontend-build /app/dist ./dist

# Cloud RunはPORT環境変数に応答する必要があるため、デフォルトをAPIサーバーにする
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]