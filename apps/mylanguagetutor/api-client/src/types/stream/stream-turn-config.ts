import type { TurnFetch } from "./turn-fetch";

/** What a platform supplies to build its ``StreamTurnFn``. */
export interface StreamTurnConfig {
  fetch: TurnFetch;
  /** Prefix of the API routes, e.g. ``/api`` on web. */
  baseUrl: string;
  /** The bearer token to send, or null when signed out. */
  getToken: () => string | null | Promise<string | null>;
  /** The server refused ``token`` (the one this request sent) with a 401. */
  onUnauthorized: (token: string | null) => void;
}
