# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /build
COPY apps/mybookkeeper/frontend/package.json apps/mybookkeeper/frontend/package-lock.json ./
RUN npm ci
COPY apps/mybookkeeper/frontend/ ./
RUN npm run build

# Stage 2: Install Python dependencies
FROM python:3.12-slim AS backend-deps
WORKDIR /deps
COPY apps/mybookkeeper/backend/requirements.txt ./
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 3: Runtime
FROM python:3.12-slim AS runtime

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=${GIT_COMMIT}

# Install postgresql-client for pg_dump/pg_restore (backup/restore scripts)
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=backend-deps /install /usr/local
COPY --from=frontend-build /build/dist /app/frontend-dist
COPY apps/mybookkeeper/backend/ /app/
COPY apps/mybookkeeper/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
