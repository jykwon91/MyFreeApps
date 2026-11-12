import type { SentSession, SessionRenewal } from "@platform/core";
import type { TurnFetch } from "./turn-fetch";

/** What a platform supplies to build its ``StreamTurnFn``. */
export interface StreamTurnConfig {
  fetch: TurnFetch;
  /** Prefix of the API routes, e.g. ``/api`` on web. */
  baseUrl: string;
  /** The bearer token to send, or null when signed out. */
  getToken: () => string | null | Promise<string | null>;
  /** Who is signed in, on a platform where that can change mid-request; read when the turn is sent. */
  currentAccount?: () => string | null;
  /**
   * For a platform whose sign-in can be renewed (the phone's refresh token): called once per turn
   * when the sign-in it was ``sent`` with got a 401, before anything streamed. Without it a 401 goes
   * straight to ``onUnauthorized``.
   */
  renewSession?: (sent: SentSession) => Promise<SessionRenewal>;
  /** The server refused ``token`` (the one this request sent) with a 401, and it couldn't be renewed. */
  onUnauthorized: (token: string | null) => void;
}
