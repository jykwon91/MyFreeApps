# NOTE: Build context is the monorepo root (see docker-compose.yml).
# All COPY paths are relative to MyFreeApps/, not apps/mybookkeeper/.
#
# Frontend dist is no longer built or copied into the api image. The
# Caddy image (docker/caddy.Dockerfile) builds and serves the frontend
# directly. See that file for the rationale.

# Stage 1: Install Python dependencies (app + shared-backend package)
FROM python:3.12-slim AS backend-deps
WORKDIR /deps
COPY packages/shared-backend/ /deps/shared-backend/
COPY apps/mybookkeeper/backend/requirements.txt ./
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

# Install:
# - postgresql-client for pg_dump/pg_restore (backup/restore scripts)
# - libreoffice for high-fidelity DOCX → PDF conversion of generated leases
#   (called via `soffice --headless --convert-to pdf` from
#   services/leases/renderer.py:render_docx_bytes_to_pdf)
# - fonts-liberation gives Times/Arial/Courier fallbacks so rendered PDFs
#   look the same regardless of which fonts the source DOCX requested
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-client \
        libreoffice-writer \
        libreoffice-core \
        fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=backend-deps /install /usr/local
COPY apps/mybookkeeper/backend/ /app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
