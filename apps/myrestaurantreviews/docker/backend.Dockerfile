# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /build
COPY apps/myrestaurantreviews/frontend/package.json apps/myrestaurantreviews/frontend/package-lock.json ./
RUN npm ci
COPY apps/myrestaurantreviews/frontend/ ./
RUN npm run build

# Stage 2: Install Python dependencies
FROM python:3.12-slim AS backend-deps
WORKDIR /deps
COPY packages/shared-backend/ /deps/shared-backend/
COPY apps/myrestaurantreviews/backend/requirements.txt ./
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
COPY --from=frontend-build /build/dist /app/frontend-dist
COPY apps/myrestaurantreviews/backend/ /app/
COPY apps/myrestaurantreviews/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8001

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
