# Caddy image with the SPA dist baked in.
#
# Designed 2026-05-01 to replace the prior architecture where:
#   - The api image's frontend-build stage produced /app/frontend-dist
#   - The api container's entrypoint cp'd that into a `frontend_dist`
#     docker volume on every container start
#   - Caddy mounted that same volume read-only
#
# That layout was the root cause of the 2026-05-01 outage: docker named
# volumes persist across image rebuilds, so the entrypoint's `cp -r`
# (which overwrites same-named files but never deletes obsolete ones) +
# any deploy where the api container wasn't actually recreated left
# stale files in the volume forever. Production served pre-2FA frontend
# code for an unknown number of weeks.
#
# This image bakes the freshly-built dist directly into the Caddy image
# at build time. The image and its frontend bytes are produced together
# atomically. There is no shared mutable state — recreating the caddy
# container with a new image guarantees fresh content. No volume, no
# entrypoint copy, no staleness class of bug.
#
# NOTE: Build context is the monorepo root (see docker-compose.yml).
# All COPY paths are relative to MyFreeApps/, not apps/mybookkeeper/.

FROM node:20-alpine AS frontend-build
WORKDIR /build
COPY apps/mybookkeeper/frontend/package.json apps/mybookkeeper/frontend/package-lock.json ./
RUN npm ci
COPY apps/mybookkeeper/frontend/ ./

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

RUN npm run build

FROM caddy:2-alpine
COPY --from=frontend-build /build/dist /srv/frontend
COPY apps/mybookkeeper/docker/Caddyfile.docker /etc/caddy/Caddyfile
