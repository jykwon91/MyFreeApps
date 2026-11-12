import { createStreamTurn } from "@mylanguagetutor/api-client/utils/createStreamTurn";
import { notifyAuthChange, renewAfterUnauthorized } from "@platform/core";
import { fetch } from "expo/fetch";
import { API_BASE_URL } from "../constants/api";
import { session } from "./session";

/**
 * The phone's turn stream. `expo/fetch` gives the response body as a stream to read as the reply
 * arrives. It skips the API client and its sign-in handling, so a 401 renews the sign-in here, once,
 * the way the API client does. If the renewed sign-in is refused too, or renewing it ends the
 * sign-in, the phone signs out.
 */
export const streamTurn = createStreamTurn({
  fetch: (url, init) => fetch(url, init),
  baseUrl: API_BASE_URL,
  getToken: () => session.tokenStore.get(),
  currentAccount: session.currentAccount,
  renewSession: renewAfterUnauthorized,
  onUnauthorized: (token) => {
    if (session.tokenStore.get() !== token) return;
    session.tokenStore.clear();
    notifyAuthChange();
  },
});
