# Stage 1: Install Python dependencies
FROM python:3.12-slim AS backend-deps
WORKDIR /deps
COPY packages/shared-backend/ /deps/shared-backend/
COPY apps/myjobhunter/backend/requirements.txt ./
# Strip the editable workspace dep line — uv export emits `-e ../../../packages/shared-backend`
# which only resolves in the monorepo working tree, not in the Docker /deps context. The package
# is installed via the positional /deps/shared-backend/ arg below; the -e line in requirements
# is for local dev only.
RUN sed -i '/^-e \.\.\/\.\.\/\.\.\/packages\/shared-backend/d' requirements.txt \
    && pip install --no-cache-dir --prefix=/install /deps/shared-backend/ -r requirements.txt

# Stage 2: Runtime
FROM python:3.12-slim AS runtime

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=${GIT_COMMIT}

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-client \
        pandoc \
        libpango-1.0-0 \
        libpangoft2-1.0-0 \
        libharfbuzz0b \
        libffi8 \
        fonts-dejavu \
        fonts-liberation \
        fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=backend-deps /install /usr/local
COPY apps/myjobhunter/backend/ /app/
COPY apps/myjobhunter/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Bake the fastembed model into the image so container startup is
# predictable — no network call on first boot, no risk of a download
# failure leaving the API up but unable to embed. The model is
# all-MiniLM-L6-v2 (~90MB ONNX). Cached under
# /root/.cache/fastembed by default; we pin the cache path explicitly
# so it survives even if HOME changes at runtime.
#
# This adds ~250MB to the final image. The alternative (download on
# first boot) is smaller-on-disk but adds ~10s to first-request latency
# and a silent-failure surface on networks that block model downloads
# (e.g. corp proxies). Per rules/no-bandaid-solutions.md, predictable
# startup wins.
ENV FASTEMBED_CACHE_PATH=/opt/fastembed-cache
RUN mkdir -p "$FASTEMBED_CACHE_PATH" \
    && python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='sentence-transformers/all-MiniLM-L6-v2', cache_dir='$FASTEMBED_CACHE_PATH')"

EXPOSE 8002

ENTRYPOINT ["/entrypoint.sh"]
# --limit-concurrency sheds load with 503 once in-flight requests exceed the
# cap, instead of queueing unboundedly (a flood would otherwise grow memory
# until OOM). Per-worker, so the effective ceiling is 2x this number.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "2", "--limit-concurrency", "64"]
