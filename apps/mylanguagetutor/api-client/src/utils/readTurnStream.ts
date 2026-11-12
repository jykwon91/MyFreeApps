import { createParser } from "eventsource-parser";
import { parseTurnEvent } from "./parseTurnEvent";
import { NETWORK_ERROR } from "../constants/turnFailureCodes";
import { NETWORK_ERROR_STATUS } from "../constants/turnRequest";
import { TurnRequestError } from "../errors/TurnRequestError";
import type { TurnByteStream } from "../types/stream/turn-byte-stream";
import type { TurnEventHandler } from "../types/stream/turn-event-handler";

/**
 * Reads a turn's SSE body and delivers each tutor event as it arrives; events
 * split across chunks are joined. Resolves when the stream closes. A read that
 * fails is a ``network_error``, unless ``signal`` aborted it.
 */
export async function readTurnStream(
  body: TurnByteStream,
  onEvent: TurnEventHandler,
  signal?: AbortSignal,
): Promise<void> {
  const parser = createParser({
    onEvent(message) {
      const event = parseTurnEvent(message.event, message.data);
      if (event) onEvent(event);
    },
  });
  const reader = body.getReader();
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
