import { readTurnStream } from "./readTurnStream";
import { turnRefusalDetail } from "./turnRefusalDetail";
import { NETWORK_ERROR, NO_STREAM } from "../constants/turnFailureCodes";
import { NETWORK_ERROR_STATUS } from "../constants/turnRequest";
import { TurnRequestError } from "../errors/TurnRequestError";
import type { StreamTurnConfig } from "../types/stream/stream-turn-config";
import type { StreamTurnFn } from "../types/stream/stream-turn-fn";
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
 * streaming throws ``TurnRequestError`` (the caller maps ``detail`` to copy); a
 * 401 also tells ``onUnauthorized`` which token was refused.
 */
export function createStreamTurn({ fetch, baseUrl, getToken, onUnauthorized }: StreamTurnConfig): StreamTurnFn {
  return async function streamTurn({ sessionId, text, onEvent, signal }) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: TurnFetchResponse;
    try {
      response = await fetch(`${baseUrl}/sessions/${encodeURIComponent(sessionId)}/turns`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text }),
        signal,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new TurnRequestError(NETWORK_ERROR_STATUS, NETWORK_ERROR);
    }

    if (!response.ok) {
      if (response.status === 401) onUnauthorized(token);
      throw new TurnRequestError(response.status, turnRefusalDetail(response.status, await errorBody(response)));
    }
    if (!response.body) throw new TurnRequestError(response.status, NO_STREAM);

    await readTurnStream(response.body, onEvent, signal);
  };
}
