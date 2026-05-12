/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TURNSTILE_SITE_KEY: string;
  readonly VITE_API_TARGET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
