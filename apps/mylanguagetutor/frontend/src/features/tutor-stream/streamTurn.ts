import { createParser } from "eventsource-parser";
import { notifyAuthChange } from "@platform/ui";
import { parseTurnEvent } from "@/features/tutor-stream/parseTurnEvent";
import { NETWORK_ERROR_STATUS, TurnRequestError } from "@/features/tutor-stream/TurnRequestError";
import type { TurnStreamEvent } from "@/types/tutor/turn-events";

const API_BASE = "/api";
const TOKEN_KEY = "token";

export interface StreamTurnOptions {
  sessionId: string;
  text: string;
  onEvent: (event: TurnStreamEvent) => void;
  signal?: AbortSignal;
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "detail" in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === "string") return detail;
    }
  } catch {
    // not JSON -- fall through
  }
  return `http_${response.status}`;
}

/**
 * POST one learner turn and deliver the tutor's SSE events as they arrive.
 *
 * ``EventSource`` can't POST or send an Authorization header, so this reads
 * the ``fetch`` body stream through ``eventsource-parser``. Resolves when the
 * stream closes; throws ``TurnRequestError`` when the turn is refused before
 * streaming (the caller maps ``detail`` to copy). A 401 signs the user out,
 * the same as the shared axios instance does.
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
    throw new TurnRequestError(NETWORK_ERROR_STATUS, "network_error");
  }

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      notifyAuthChange();
    }
    throw new TurnRequestError(response.status, await errorDetail(response));
  }
  if (!response.body) throw new TurnRequestError(response.status, "no_stream");

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
    throw new TurnRequestError(NETWORK_ERROR_STATUS, "network_error");
  } finally {
    reader.releaseLock();
  }
}
