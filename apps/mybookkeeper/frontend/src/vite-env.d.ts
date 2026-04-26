/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POSTHOG_KEY: string;
  readonly VITE_POSTHOG_HOST: string;
  readonly VITE_POSTHOG_DASHBOARD_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
