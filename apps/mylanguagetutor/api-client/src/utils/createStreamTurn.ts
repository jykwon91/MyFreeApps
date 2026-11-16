import { failIfStalled } from "./failIfStalled";
import { readTurnStream } from "./readTurnStream";
import { turnRefusalDetail } from "./turnRefusalDetail";
import { NETWORK_ERROR, NO_STREAM } from "../constants/turnFailureCodes";
import { NETWORK_ERROR_STATUS, TURN_RESPONSE_TIMEOUT_MS } from "../constants/turnRequest";
import { TurnRequestError } from "../errors/TurnRequestError";
import type { StreamTurnConfig } from "../types/stream/stream-turn-config";
import type { StreamTurnFn } from "../types/stream/stream-turn-fn";
import type { StreamTurnOptions } from "../types/stream/stream-turn-options";
import type { TurnFetchResponse } from "../types/stream/turn-fetch-response";

async function errorBody(response: TurnFetchResponse): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined; // not JSON
  }
}

/**
 * Builds the platform's ``StreamTurnFn``: POST one learner turn and deliver the
 * tutor's SSE events as they arrive.
 *
 * ``EventSource`` can't POST or send an Authorization header, so the ``fetch``
 * body stream is read instead (``readTurnStream``). A turn refused before
 * streaming throws ``TurnRequestError`` (the caller maps ``detail`` to copy). A
 * 401 is sent again once if ``renewSession`` gets a new token (a 401 comes before
 * the turn is taken, so it can't be answered twice); otherwise ``onUnauthorized``
 * hears which token was refused.
 *
 * A connection can go quiet without failing (a phone moving between networks), so the request
 * has its own abort, which the caller's ``signal`` also triggers: no response headers within
 * ``TURN_RESPONSE_TIMEOUT_MS``, or a stream gone quiet (``readTurnStream``), aborts it and
 * fails the turn with ``connection_lost``.
 */
export function createStreamTurn({ fetch, baseUrl, getToken, currentAccount, renewSession, onUnauthorized }: StreamTurnConfig): StreamTurnFn {
  async function send({ sessionId, text, onEvent, signal }: StreamTurnOptions, mayRenew: boolean): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };
    const token = await getToken();
    const account = currentAccount?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    // The request's own abort: the caller's signal triggers it, and so does a stalled connection.
    const request = new AbortController();
    const abortRequest = () => request.abort();
    if (signal?.aborted) abortRequest();
    signal?.addEventListener("abort", abortRequest, { once: true });
    try {
      let response: TurnFetchResponse;
      try {
        response = await failIfStalled(
          fetch(`${baseUrl}/sessions/${encodeURIComponent(sessionId)}/turns`, {
            method: "POST",
            headers,
            body: JSON.stringify({ text }),
            signal: request.signal,
          }),
          TURN_RESPONSE_TIMEOUT_MS,
          abortRequest,
        );
      } catch (err) {
        if (signal?.aborted || err instanceof TurnRequestError) throw err;
        throw new TurnRequestError(NETWORK_ERROR_STATUS, NETWORK_ERROR);
      }

      if (!response.ok) {
        if (response.status === 401) {
          const renewal = mayRenew && renewSession ? await renewSession({ token, account }) : "ended";
          if (renewal === "renewed") return await send({ sessionId, text, onEvent, signal }, false);
          if (renewal === "unreachable") throw new TurnRequestError(NETWORK_ERROR_STATUS, NETWORK_ERROR);
          onUnauthorized(token);
        }
        throw new TurnRequestError(response.status, turnRefusalDetail(response.status, await errorBody(response)));
      }
      if (!response.body) throw new TurnRequestError(response.status, NO_STREAM);

      await readTurnStream(response.body, onEvent, signal, abortRequest);
    } finally {
      signal?.removeEventListener("abort", abortRequest);
    }
  }

  return (options) => send(options, true);
}
