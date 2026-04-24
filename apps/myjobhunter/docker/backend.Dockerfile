# Stage 1: Build frontend (npm workspaces from repo root)
FROM node:20-alpine AS frontend-build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared-frontend/package.json ./packages/shared-frontend/
COPY apps/myjobhunter/frontend/package.json ./apps/myjobhunter/frontend/
RUN npm ci --ignore-scripts
COPY packages/shared-frontend ./packages/shared-frontend
COPY apps/myjobhunter/frontend ./apps/myjobhunter/frontend
RUN npm run build --workspace=apps/myjobhunter/frontend

# Stage 2: Install Python dependencies
FROM python:3.12-slim AS backend-deps
WORKDIR /deps
COPY packages/shared-backend/ /deps/shared-backend/
COPY apps/myjobhunter/backend/requirements.txt ./
RUN pip install --no-cache-dir --prefix=/install /deps/shared-backend/ -r requirements.txt

# Stage 3: Runtime
FROM python:3.12-slim AS runtime

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=${GIT_COMMIT}

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=backend-deps /install /usr/local
COPY --from=frontend-build /repo/apps/myjobhunter/frontend/dist /app/frontend-dist
COPY apps/myjobhunter/backend/ /app/
COPY apps/myjobhunter/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8002

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "2"]
