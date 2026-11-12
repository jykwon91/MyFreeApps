// Stands in for expo/fetch, which the turn stream reads the tutor's reply through:
// jest.mock("expo/fetch", () => jest.requireActual("../test-support/fakeExpoFetch")).
import type { TurnFetch } from "@mylanguagetutor/api-client/types/stream/turn-fetch";
import type { TurnFetchResponse } from "@mylanguagetutor/api-client/types/stream/turn-fetch-response";
import { API_BASE_URL } from "../src/constants/api";
import type { FakeTurnEvent } from "./types/FakeTurnEvent";
import type { FakeTurnRequest } from "./types/FakeTurnRequest";
import type { FakeTurnRoute } from "./types/FakeTurnRoute";
import type { FakeTurnStream } from "./types/FakeTurnStream";
import type { FakeTurnStreamOptions } from "./types/FakeTurnStreamOptions";

const encoder = new TextEncoder();
let route: FakeTurnRoute | null = null;

/** A reply to stream. Each read waits for the next event, the end, a broken connection or an abort. */
export function turnStream({ arrivesAsStopped }: FakeTurnStreamOptions = {}): FakeTurnStream {
  const chunks: Uint8Array[] = [];
  const write = ({ event, data }: FakeTurnEvent) => chunks.push(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  let isClosed = false;
  let isBroken = false;
  let reader: AbortSignal | undefined;
  let wake: (() => void) | null = null;
  const notify = () => {
    wake?.();
    wake = null;
  };

  return {
    emit: (event, data) => {
      write({ event, data });
      notify();
    },
    close: () => {
      isClosed = true;
      notify();
    },
    fail: () => {
      isBroken = true;
      notify();
    },
    isAborted: () => reader?.aborted === true,
    open: (signal) => {
      reader = signal;
      signal?.addEventListener("abort", () => {
        if (arrivesAsStopped) write(arrivesAsStopped);
        notify();
      });
      return {
        getReader: () => ({
          read: async () => {
            for (;;) {
              if (signal?.aborted && !arrivesAsStopped) throw new Error("Aborted");
              const value = chunks.shift();
              if (value) return { done: false, value };
              if (signal?.aborted) throw new Error("Aborted");
              if (isBroken) throw new TypeError("Network request failed");
              if (isClosed) return { done: true };
              await new Promise<void>((resolve) => {
                wake = resolve;
              });
            }
          },
          releaseLock: () => {},
        }),
      };
    },
  };
}

/** Answers each turn the screen sends with `answer`, and records them. */
export function serveTurns(answer: FakeTurnRoute): FakeTurnRequest[] {
  const sent: FakeTurnRequest[] = [];
  route = (request) => {
    sent.push(request);
    return answer(request);
  };
  return sent;
}

/** Settles with `pending`, or rejects as soon as `signal` aborts, as a real fetch does while it waits for headers. */
function untilAborted<T>(pending: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error("Aborted"));
    if (signal.aborted) abort();
    signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export const fetch: TurnFetch = async (url, { headers, body, signal }) => {
  if (!route) throw new Error("No turn server: call serveTurns first.");
  const request: FakeTurnRequest = {
    path: url.slice(API_BASE_URL.length),
    authorization: headers.Authorization,
    text: (JSON.parse(body) as { text: string }).text,
  };
  const answer = await untilAborted(Promise.resolve(route(request)), signal);
  if ("unreachable" in answer) throw new TypeError("Network request failed");
  if ("stream" in answer) {
    const response: TurnFetchResponse = { ok: true, status: 200, body: answer.stream.open(signal), json: async () => undefined };
    return response;
  }
  return { ok: answer.status < 400, status: answer.status, body: null, json: async () => answer.data };
};
