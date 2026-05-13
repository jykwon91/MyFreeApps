# GENERATED FROM infra/templates/docker/caddy.Dockerfile.j2 — DO NOT EDIT.
# Edit the template + apps/<app>/app.yaml; re-render via:
#   python -m platform_shared.infra.render --app myjobhunter
#
# Caddy image with the SPA dist baked in.
#
# Designed 2026-05-01 to replace the prior architecture where the api image's
# frontend-build stage produced /app/frontend-dist, the api container's
# entrypoint cp'd that into a `frontend_dist` docker volume on every start,
# and Caddy mounted that same volume read-only.
#
# That layout was the root cause of the 2026-05-01 outage: docker named
# volumes persist across image rebuilds, so the entrypoint's `cp -r`
# (which overwrites same-named files but never deletes obsolete ones) +
# any deploy where the api container wasn't actually recreated left stale
# files in the volume forever. Production served pre-2FA frontend code
# for an unknown number of weeks.
#
# This image bakes the freshly-built dist directly into the Caddy image
# at build time. The image and its frontend bytes are produced together
# atomically. There is no shared mutable state — recreating the caddy
# container with a new image guarantees fresh content. No volume, no
# entrypoint copy, no staleness class of bug.
#
# NOTE: Build context is the monorepo root (see docker-compose.yml).
# All COPY paths are relative to MyFreeApps/, not apps/myjobhunter/.
#
# Workspace-aware build: each app imports from `@platform/ui`
# (packages/shared-frontend), so the build stage must install the entire
# workspace closure, not just the per-app package-lock.json. The root
# package-lock.json is the source of truth for `npm ci`; per-app
# lockfiles are kept in sync for IDE compatibility but NOT used here.

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
# because the bundle is already minified and frozen by the time caddy starts.
#
# VITE_TURNSTILE_SITE_KEY: Cloudflare Turnstile public site key.
# Empty value → TurnstileWidget renders null and registration POSTs
# without a captcha token (the 2026-05-05 silent-registration-broken
# bug — site key never made it into the bundle because this ARG didn't exist).
# See rules/verify-frontend-build-args.md.
ARG VITE_TURNSTILE_SITE_KEY=
ENV VITE_TURNSTILE_SITE_KEY=${VITE_TURNSTILE_SITE_KEY}

RUN npm run build --workspace=apps/myjobhunter/frontend

FROM caddy:2-alpine
COPY --from=frontend-build /repo/apps/myjobhunter/frontend/dist /srv/frontend
COPY apps/myjobhunter/docker/Caddyfile.docker /etc/caddy/Caddyfile
