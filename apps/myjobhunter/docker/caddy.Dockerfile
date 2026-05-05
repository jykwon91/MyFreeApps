# Caddy image with the SPA dist baked in.
#
# Mirrors the pattern introduced in apps/mybookkeeper/docker/caddy.Dockerfile
# on 2026-05-01 (MBK PR #155) — applied to MJH here before MJH ships to prod
# to prevent the same stale-bundle outage class from ever occurring.
#
# Prior architecture (the anti-pattern this replaces):
#   - The api image's frontend-build stage produced /app/frontend-dist
#   - entrypoint.sh cp'd that into a `frontend_dist` docker named volume on
#     every container start
#   - Caddy mounted that same volume read-only from the plain caddy:2-alpine image
#
# That layout has the same root cause as the 2026-05-01 MBK outage: docker named
# volumes persist across image rebuilds. The entrypoint cp overwrites same-named
# files but never deletes obsolete ones. Any deploy where the api container
# wasn't actually recreated left stale files in the volume forever.
#
# This image bakes the freshly-built dist directly into the Caddy image at build
# time. Image and frontend bytes are produced together atomically. There is no
# shared mutable state — recreating the caddy container with a new image
# guarantees fresh content. No volume, no entrypoint copy, no staleness class.
#
# NOTE: Build context is the monorepo root (see docker-compose.yml).
# All COPY paths are relative to MyFreeApps/, not apps/myjobhunter/.

FROM node:20-alpine AS frontend-build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared-frontend/package.json ./packages/shared-frontend/
COPY apps/myjobhunter/frontend/package.json ./apps/myjobhunter/frontend/
RUN npm ci --ignore-scripts
COPY packages/shared-frontend ./packages/shared-frontend
COPY apps/myjobhunter/frontend ./apps/myjobhunter/frontend

# Frontend build-time public env. Vite inlines anything prefixed with
# VITE_ into the bundle at build time — these MUST be passed as build
# args from docker-compose, NOT runtime env vars on the caddy container,
# because the bundle is already minified and frozen by the time caddy
# starts.
#
# VITE_TURNSTILE_SITE_KEY: Cloudflare Turnstile public site key.
# Empty value → TurnstileWidget renders null and registration POSTs
# without a captcha token, so the backend's require_turnstile dependency
# returns 400 captcha_token_required. This was the 2026-05-05 silent-
# registration-broken bug — the SECRET key was wired but the SITE key
# never made it into the bundle because this ARG didn't exist.
ARG VITE_TURNSTILE_SITE_KEY=
ENV VITE_TURNSTILE_SITE_KEY=${VITE_TURNSTILE_SITE_KEY}

RUN npm run build --workspace=apps/myjobhunter/frontend

FROM caddy:2-alpine
COPY --from=frontend-build /repo/apps/myjobhunter/frontend/dist /srv/frontend
COPY apps/myjobhunter/docker/Caddyfile.docker /etc/caddy/Caddyfile
