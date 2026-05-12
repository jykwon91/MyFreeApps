# Caddy image with the SPA dist baked in.
#
# Mirrors apps/myjobhunter/docker/caddy.Dockerfile — applied to MGA
# before shipping to prod to prevent the stale-bundle outage class.
#
# NOTE: Build context is the monorepo root (see docker-compose.yml).
# All COPY paths are relative to MyFreeApps/, not apps/mygamingassistant/.

FROM node:20-alpine AS frontend-build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared-frontend/package.json ./packages/shared-frontend/
COPY apps/mygamingassistant/frontend/package.json ./apps/mygamingassistant/frontend/
RUN npm ci --ignore-scripts
COPY packages/shared-frontend ./packages/shared-frontend
COPY apps/mygamingassistant/frontend ./apps/mygamingassistant/frontend

# Frontend build-time public env. Vite inlines anything prefixed with
# VITE_ into the bundle at build time — these MUST be passed as build
# args from docker-compose, NOT runtime env vars on the caddy container,
# because the bundle is already minified and frozen by the time caddy starts.
#
# VITE_TURNSTILE_SITE_KEY: Cloudflare Turnstile public site key.
# MGA has no public registration (single-user app), so Turnstile is only
# relevant on the /forgot-password form. The ARG is still required here
# so conformance tests pass and the same infra pattern applies consistently
# to all apps in the monorepo. If Turnstile is not configured, the widget
# renders nothing and the forgot-password form proceeds without a captcha
# token (backend require_turnstile is a no-op when TURNSTILE_SECRET_KEY
# is empty). See rules/verify-frontend-build-args.md.
ARG VITE_TURNSTILE_SITE_KEY=
ENV VITE_TURNSTILE_SITE_KEY=${VITE_TURNSTILE_SITE_KEY}

RUN npm run build --workspace=apps/mygamingassistant/frontend

FROM caddy:2-alpine
COPY --from=frontend-build /repo/apps/mygamingassistant/frontend/dist /srv/frontend
COPY apps/mygamingassistant/docker/Caddyfile.docker /etc/caddy/Caddyfile
