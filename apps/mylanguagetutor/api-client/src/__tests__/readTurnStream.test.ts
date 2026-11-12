import { describe, expect, it, vi } from "vitest";
import { readTurnStream } from "../utils/readTurnStream";
import type { TurnByteStream } from "../types/stream/turn-byte-stream";
import type { TurnStreamEvent } from "../types/tutor/turn-stream-event";
import { sseBody } from "./support/sseBody";

function failingBody(error: Error): TurnByteStream & { released: () => boolean } {
  let released = false;
  return {
    getReader: () => ({
      read: () => Promise.reject(error),
      releaseLock: () => {
        released = true;
      },
    }),
    released: () => released,
  };
}

describe("readTurnStream", () => {
  it("joins an event split across chunks and a multi-byte character split across reads", async () => {
    const bytes = new TextEncoder().encode('event: reply.delta\ndata: {"text":"¿Qué?"}\n\n');
    const split = bytes.indexOf(0xbf); // the second byte of "¿"
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, split));
        controller.enqueue(bytes.slice(split));
        controller.close();
      },
    });
    const events: TurnStreamEvent[] = [];

    await readTurnStream(body, (e) => events.push(e));

    expect(events).toEqual([{ type: "reply.delta", text: "¿Qué?" }]);
  });

  it("skips events it doesn't recognise", async () => {
    const onEvent = vi.fn();

    await readTurnStream(sseBody(["event: mystery\ndata: {}\n\nevent: reply.done\ndata: {}\n\n"]), onEvent);

    expect(onEvent.mock.calls.map((call) => call[0])).toEqual([{ type: "reply.done" }]);
  });

  it("maps a failed read to network_error and releases the reader", async () => {
    const body = failingBody(new TypeError("network lost"));

    await expect(readTurnStream(body, () => {})).rejects.toMatchObject({ status: 0, detail: "network_error" });
    expect(body.released()).toBe(true);
  });

  it("rethrows the read's own error when the caller aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = new Error("aborted");

    await expect(readTurnStream(failingBody(abort), () => {}, controller.signal)).rejects.toBe(abort);
  });
});
