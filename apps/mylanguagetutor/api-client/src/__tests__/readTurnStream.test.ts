import { afterEach, describe, expect, it, vi } from "vitest";
import { TURN_STREAM_IDLE_TIMEOUT_MS } from "../constants/turnRequest";
import { TurnAbortedError } from "../errors/TurnAbortedError";
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

const encoder = new TextEncoder();

/** A body whose reads hand out ``chunks`` when the test pushes them, and otherwise wait: a connection gone quiet. */
function quietBody() {
  const waiting: Array<(chunk: { done: boolean; value?: Uint8Array }) => void> = [];
  const body: TurnByteStream = {
    getReader: () => ({
      read: () => new Promise((resolve) => waiting.push(resolve)),
      releaseLock: () => {},
    }),
  };
  return {
    body,
    push: (text: string) => waiting.shift()?.({ done: false, value: encoder.encode(text) }),
    close: () => waiting.shift()?.({ done: true }),
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

  it("tells onData of every chunk that arrives, a keep-alive comment as much as an event", async () => {
    const onEvent = vi.fn();
    const onData = vi.fn();

    await readTurnStream(
      sseBody(['event: reply.done\ndata: {}\n\n', ": ping\n\n", 'event: done\ndata: {"status":"complete","usage":{"remaining_fraction":0.5}}\n\n']),
      onEvent,
      undefined,
      undefined,
      onData,
    );

    expect(onData).toHaveBeenCalledTimes(3);
    expect(onEvent.mock.calls.map((call) => call[0].type)).toEqual(["reply.done", "done"]);
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

  it("delivers nothing from a read that finished after the caller aborted", async () => {
    const controller = new AbortController();
    const onEvent = vi.fn();
    const body: TurnByteStream = {
      getReader: () => ({
        read: async () => {
          // The bytes had arrived, but the caller aborted before this read's result was handled.
          controller.abort();
          return { done: false, value: new TextEncoder().encode('event: reply.delta\ndata: {"text":"¡Hola!"}\n\n') };
        },
        releaseLock: () => {},
      }),
    };

    await expect(readTurnStream(body, onEvent, controller.signal)).rejects.toBeInstanceOf(TurnAbortedError);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("stops delivering a chunk's events once the caller aborts partway through it", async () => {
    const controller = new AbortController();
    const delivered: TurnStreamEvent[] = [];
    const chunk = 'event: reply.delta\ndata: {"text":"Uno."}\n\nevent: reply.delta\ndata: {"text":" Dos."}\n\n';

    const read = readTurnStream(
      sseBody([chunk]),
      (event) => {
        delivered.push(event);
        controller.abort();
      },
      controller.signal,
    );

    await expect(read).rejects.toBeInstanceOf(TurnAbortedError);
    expect(delivered).toEqual([{ type: "reply.delta", text: "Uno." }]);
  });
});

describe("readTurnStream on a connection that goes quiet", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fails as connection_lost once nothing arrives for the idle limit, after the words so far", async () => {
    vi.useFakeTimers();
    const { body, push } = quietBody();
    const events: TurnStreamEvent[] = [];
    const onStall = vi.fn();

    const read = readTurnStream(body, (e) => events.push(e), undefined, onStall);
    const failure = read.catch((err: unknown) => err);
    push('event: reply.delta\ndata: {"text":"¡Hola!"}\n\n');
    await vi.advanceTimersByTimeAsync(TURN_STREAM_IDLE_TIMEOUT_MS - 1);
    expect(onStall).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(await failure).toMatchObject({ status: 0, detail: "connection_lost" });
    expect(onStall).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{ type: "reply.delta", text: "¡Hola!" }]);
  });

  it("never cuts off a long reply that keeps arriving, keep-alives included", async () => {
    vi.useFakeTimers();
    const { body, push, close } = quietBody();
    const events: TurnStreamEvent[] = [];
    const onStall = vi.fn();

    const read = readTurnStream(body, (e) => events.push(e), undefined, onStall);
    for (let i = 0; i < 10; i += 1) {
      await vi.advanceTimersByTimeAsync(TURN_STREAM_IDLE_TIMEOUT_MS - 1);
      push(i % 2 === 0 ? ": ping\n\n" : `event: reply.delta\ndata: {"text":"${i}"}\n\n`);
    }
    await vi.advanceTimersByTimeAsync(TURN_STREAM_IDLE_TIMEOUT_MS - 1);
    close();

    await expect(read).resolves.toBeUndefined();
    expect(onStall).not.toHaveBeenCalled();
    expect(events.map((e) => (e.type === "reply.delta" ? e.text : e.type))).toEqual(["1", "3", "5", "7", "9"]);
  });
});
