# Stage 1: Install Python dependencies
FROM python:3.12-slim AS backend-deps
WORKDIR /deps
COPY packages/shared-backend/ /deps/shared-backend/
COPY apps/__APP_SLUG__/backend/requirements.txt ./
# Strip the editable workspace dep line — uv export emits `-e ../../../packages/shared-backend`
# which only resolves in the monorepo working tree, not in the Docker /deps context.
RUN sed -i '/^-e \.\.\/\.\.\/\.\.\/packages\/shared-backend/d' requirements.txt \
    && pip install --no-cache-dir --prefix=/install /deps/shared-backend/ -r requirements.txt

# Stage 2: Runtime
FROM python:3.12-slim AS runtime

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=${GIT_COMMIT}

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=backend-deps /install /usr/local
COPY apps/__APP_SLUG__/backend/ /app/
COPY apps/__APP_SLUG__/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE __API_PORT__

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "__API_PORT__", "--workers", "2"]
