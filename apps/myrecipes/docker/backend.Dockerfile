# Stage 1: Install Python dependencies
FROM python:3.12-slim AS backend-deps
WORKDIR /deps
COPY packages/shared-backend/ /deps/shared-backend/
COPY apps/myrecipes/backend/requirements.txt ./
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
COPY apps/myrecipes/backend/ /app/
COPY apps/myrecipes/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8008

ENTRYPOINT ["/entrypoint.sh"]
# --limit-concurrency sheds load with 503 once in-flight requests exceed the
# cap, instead of queueing unboundedly (a flood would otherwise grow memory
# until OOM). Per-worker, so the effective ceiling is 2x this number.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8008", "--workers", "2", "--limit-concurrency", "64"]
