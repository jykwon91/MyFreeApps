import { createParser } from "eventsource-parser";
import { notifyAuthChange } from "@platform/ui";
import { parseTurnEvent } from "@mylanguagetutor/api-client/utils/parseTurnEvent";
import { turnRefusalDetail } from "@mylanguagetutor/api-client/utils/turnRefusalDetail";
import { NETWORK_ERROR, NO_STREAM } from "@mylanguagetutor/api-client/constants/turnFailureCodes";
import { NETWORK_ERROR_STATUS } from "@mylanguagetutor/api-client/constants/turnRequest";
import { TurnRequestError } from "@mylanguagetutor/api-client/errors/TurnRequestError";
import type { TurnStreamEvent } from "@mylanguagetutor/api-client/types/tutor/turn-stream-event";

const API_BASE = "/api";
const TOKEN_KEY = "token";

export interface StreamTurnOptions {
  sessionId: string;
  text: string;
  onEvent: (event: TurnStreamEvent) => void;
  signal?: AbortSignal;
}

async function errorBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined; // not JSON
  }
}

/**
 * POST one learner turn and deliver the tutor's SSE events as they arrive.
 *
 * ``EventSource`` can't POST or send an Authorization header, so this reads
 * the ``fetch`` body stream through ``eventsource-parser``. Resolves when the
 * stream closes; throws ``TurnRequestError`` when the turn is refused before
 * streaming (the caller maps ``detail`` to copy). A 401 for the token signed in
 * now signs the user out, the same as the shared axios instance does.
 */
export async function streamTurn({ sessionId, text, onEvent, signal }: StreamTurnOptions): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/turns`, {
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
    // Only a rejection of the token signed in now signs out: someone may have signed
    // in, here or in another tab, while this request was in flight.
    if (response.status === 401 && localStorage.getItem(TOKEN_KEY) === token) {
      localStorage.removeItem(TOKEN_KEY);
      notifyAuthChange();
    }
    throw new TurnRequestError(response.status, turnRefusalDetail(response.status, await errorBody(response)));
  }
  if (!response.body) throw new TurnRequestError(response.status, NO_STREAM);

  const parser = createParser({
    onEvent(message) {
      const event = parseTurnEvent(message.event, message.data);
      if (event) onEvent(event);
    },
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
    }
    parser.feed(decoder.decode());
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new TurnRequestError(NETWORK_ERROR_STATUS, NETWORK_ERROR);
  } finally {
    reader.releaseLock();
  }
}
