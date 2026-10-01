# PackWise production image.
# Stage 1 builds the React + TypeScript web dashboard (static files).
FROM node:24-slim AS web
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json ./
COPY public ./public
COPY src ./src
COPY shared ./shared
COPY reference-data ./reference-data
RUN npm run build

# Stage 2 runs the Python + FastAPI backend (NumPy/SciPy engine, PostgreSQL or SQLite),
# which also serves the built dashboard.
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt
COPY backend ./backend
COPY reference-data ./reference-data
COPY --from=web /src/dist ./dist
ENV PACKWISE_DATA_DIR=/data \
    PACKWISE_UPLOAD_DIR=/data/uploads \
    PACKWISE_WEB_DIST=/app/dist \
    PORT=8787
EXPOSE 8787
WORKDIR /app/backend
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
