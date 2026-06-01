/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TURNSTILE_SITE_KEY: string;
  readonly VITE_API_TARGET: string;
  /**
   * "true" in the production serve-only deployment (public read-only library,
   * zero auth). Anything else (unset / "false") keeps the full auth UI. Read
   * via src/lib/serveOnly.ts → isServeOnly(). Wired through the docker
   * build-args chain (docker-compose build.args → caddy.Dockerfile ARG/ENV)
   * exactly like VITE_TURNSTILE_SITE_KEY.
   */
  readonly VITE_SERVE_ONLY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
