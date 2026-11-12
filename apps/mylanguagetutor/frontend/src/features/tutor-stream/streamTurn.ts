import { notifyAuthChange } from "@platform/ui";
import { createStreamTurn } from "@mylanguagetutor/api-client/utils/createStreamTurn";
import type { StreamTurnFn } from "@mylanguagetutor/api-client/types/stream/stream-turn-fn";

const API_BASE = "/api";
const TOKEN_KEY = "token";

/**
 * The web's turn stream: the browser's ``fetch`` with the signed-in token from
 * ``localStorage``. A 401 for the token signed in now signs the user out, the
 * same as the shared axios instance does.
 */
export const streamTurn: StreamTurnFn = createStreamTurn({
  fetch: (url, init) => fetch(url, init),
  baseUrl: API_BASE,
  getToken: () => localStorage.getItem(TOKEN_KEY),
  onUnauthorized: (token) => {
    // Only a rejection of the token signed in now signs out: someone may have signed
    // in, here or in another tab, while this request was in flight.
    if (localStorage.getItem(TOKEN_KEY) !== token) return;
    localStorage.removeItem(TOKEN_KEY);
    notifyAuthChange();
  },
});
