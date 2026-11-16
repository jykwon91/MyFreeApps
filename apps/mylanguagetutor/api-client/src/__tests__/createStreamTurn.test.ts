import { afterEach, describe, expect, it, vi } from "vitest";
import { TURN_RESPONSE_TIMEOUT_MS, TURN_STREAM_IDLE_TIMEOUT_MS } from "../constants/turnRequest";
import { createStreamTurn } from "../utils/createStreamTurn";
import { TurnRequestError } from "../errors/TurnRequestError";
import type { SentSession, SessionRenewal } from "@platform/core";
import type { StreamTurnConfig } from "../types/stream/stream-turn-config";
import type { TurnFetch } from "../types/stream/turn-fetch";
import type { TurnFetchInit } from "../types/stream/turn-fetch-init";
import type { TurnStreamEvent } from "../types/tutor/turn-stream-event";
import { sseBody } from "./support/sseBody";

function setup(fetch: TurnFetch, token: string | null = "test-token") {
  const onUnauthorized = vi.fn<StreamTurnConfig["onUnauthorized"]>();
  const streamTurn = createStreamTurn({ fetch, baseUrl: "/api", getToken: () => token, onUnauthorized });
  return { streamTurn, onUnauthorized };
}

function answering(response: Response) {
  return vi.fn<TurnFetch>().mockResolvedValue(response);
}

describe("createStreamTurn", () => {
  it("POSTs with the bearer token and delivers events across chunk boundaries", async () => {
    const fetch = answering(
      new Response(
        sseBody([
          'event: turn.started\ndata: {"turn_id":"t1","seq":1}\n\n',
          'event: reply.delta\ndata: {"text":"Ho',
          'la"}\n\nevent: done\ndata: {"status":"complete","usage":{"remaining_fraction":0.9}}\n\n',
        ]),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    const { streamTurn } = setup(fetch);
    const events: TurnStreamEvent[] = [];

    await streamTurn({ sessionId: "s1", text: "hola", onEvent: (e) => events.push(e) });

    const [url, init] = fetch.mock.calls[0] as [string, TurnFetchInit];
    expect(url).toBe("/api/sessions/s1/turns");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: "Bearer test-token",
    });
    expect(JSON.parse(init.body)).toEqual({ text: "hola" });
    expect(events.map((e) => e.type)).toEqual(["turn.started", "reply.delta", "done"]);
    expect(events[1]).toEqual({ type: "reply.delta", text: "Hola" });
  });

  it("sends no Authorization header when signed out, and encodes the session id", async () => {
    const fetch = answering(new Response(sseBody([]), { status: 200 }));
    const { streamTurn } = setup(fetch, null);

    await streamTurn({ sessionId: "a/b", text: "hola", onEvent: () => {} });

    const [url, init] = fetch.mock.calls[0] as [string, TurnFetchInit];
    expect(url).toBe("/api/sessions/a%2Fb/turns");
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("awaits an async token source", async () => {
    const fetch = answering(new Response(sseBody([]), { status: 200 }));
    const streamTurn = createStreamTurn({
      fetch,
      baseUrl: "https://api.example",
      getToken: async () => "phone-token",
      onUnauthorized: () => {},
    });

    await streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {} });

    const [url, init] = fetch.mock.calls[0] as [string, TurnFetchInit];
    expect(url).toBe("https://api.example/sessions/s1/turns");
    expect(init.headers.Authorization).toBe("Bearer phone-token");
  });

  it("throws TurnRequestError with the refusal code", async () => {
    const { streamTurn, onUnauthorized } = setup(
      answering(new Response(JSON.stringify({ detail: "daily_limit_reached" }), { status: 429 })),
    );

    const error = await streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {} }).catch((e) => e);

    expect(error).toBeInstanceOf(TurnRequestError);
    expect(error).toMatchObject({ status: 429, detail: "daily_limit_reached" });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("falls back to http_<status> when the refusal body isn't JSON", async () => {
    const { streamTurn } = setup(answering(new Response("<html>bad gateway</html>", { status: 502 })));

    await expect(streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {} })).rejects.toMatchObject({
      status: 502,
      detail: "http_502",
    });
  });

  it("tells onUnauthorized which token a 401 refused", async () => {
    const { streamTurn, onUnauthorized } = setup(
      answering(new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 })),
    );

    await expect(streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {} })).rejects.toMatchObject({
      status: 401,
      detail: "Unauthorized",
    });
    expect(onUnauthorized).toHaveBeenCalledWith("test-token");
  });

  it("signs out on a 401 before reading the error body", async () => {
    const calls: string[] = [];
    const response = new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 });
    const json = response.json.bind(response);
    vi.spyOn(response, "json").mockImplementation(async () => {
      calls.push("json");
      return json();
    });
    const streamTurn = createStreamTurn({
      fetch: answering(response),
      baseUrl: "/api",
      getToken: () => "test-token",
      onUnauthorized: () => {
        calls.push("onUnauthorized");
      },
    });

    await expect(streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {} })).rejects.toBeInstanceOf(TurnRequestError);
    expect(calls).toEqual(["onUnauthorized", "json"]);
  });

  it("maps a failed fetch to network_error", async () => {
    const { streamTurn } = setup(vi.fn<TurnFetch>().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {} })).rejects.toMatchObject({
      status: 0,
      detail: "network_error",
    });
  });

  it("rethrows the abort when the caller aborted the fetch", async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = new Error("aborted");
    const { streamTurn } = setup(vi.fn<TurnFetch>().mockRejectedValue(abort));

    await expect(
      streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {}, signal: controller.signal }),
    ).rejects.toBe(abort);
  });

  it("refuses a successful response with no body as no_stream", async () => {
    const { streamTurn } = setup(answering(new Response(null, { status: 200 })));

    await expect(streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {} })).rejects.toMatchObject({
      status: 200,
      detail: "no_stream",
    });
  });
});

describe("createStreamTurn on a connection that goes quiet", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A fetch that never answers, only failing once aborted as a real one does; records the signal it was given. */
  function neverAnswering() {
    const signals: AbortSignal[] = [];
    const fetch = vi.fn<TurnFetch>((_url, init) => {
      if (init.signal) signals.push(init.signal);
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    return { fetch, signals };
  }

  it("fails as connection_lost and aborts the request when no response arrives in time", async () => {
    vi.useFakeTimers();
    const { fetch, signals } = neverAnswering();
    const { streamTurn } = setup(fetch);

    const failure = streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {} }).catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(TURN_RESPONSE_TIMEOUT_MS - 1);
    expect(signals[0].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const error = await failure;
    expect(error).toBeInstanceOf(TurnRequestError);
    expect(error).toMatchObject({ status: 0, detail: "connection_lost" });
    expect(signals[0].aborted).toBe(true);
  });

  it("fails as connection_lost and aborts the request when the stream goes quiet mid-reply", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: reply.delta\ndata: {"text":"¡Hola!"}\n\n'));
      },
    });
    const fetch = vi.fn<TurnFetch>(async (_url, init) => {
      if (init.signal) signals.push(init.signal);
      return new Response(body, { status: 200 });
    });
    const { streamTurn } = setup(fetch);
    const events: TurnStreamEvent[] = [];

    const failure = streamTurn({ sessionId: "s1", text: "hola", onEvent: (e) => events.push(e) }).catch(
      (err: unknown) => err,
    );
    await vi.advanceTimersByTimeAsync(TURN_STREAM_IDLE_TIMEOUT_MS);

    expect(await failure).toMatchObject({ status: 0, detail: "connection_lost" });
    expect(signals[0].aborted).toBe(true);
    expect(events).toEqual([{ type: "reply.delta", text: "¡Hola!" }]);
  });

  it("passes the caller's abort on to the request", async () => {
    const { fetch, signals } = neverAnswering();
    const { streamTurn } = setup(fetch);
    const controller = new AbortController();

    const turn = streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {}, signal: controller.signal });
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    controller.abort();

    expect(signals[0].aborted).toBe(true);
    await expect(turn).rejects.toThrow("aborted");
  });
});

describe("createStreamTurn with a renewable sign-in", () => {
  function unauthorized() {
    return new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 });
  }

  function setupRenewing(fetch: TurnFetch, renewal: SessionRenewal) {
    let token = "old-token";
    const onUnauthorized = vi.fn<StreamTurnConfig["onUnauthorized"]>();
    const renewSession = vi.fn(async (_sent: SentSession) => {
      if (renewal === "renewed") token = "new-token";
      return renewal;
    });
    const streamTurn = createStreamTurn({
      fetch,
      baseUrl: "/api",
      getToken: () => token,
      currentAccount: () => "learner-1",
      renewSession,
      onUnauthorized,
    });
    return { streamTurn, renewSession, onUnauthorized };
  }

  it("renews the sign-in after a 401 and sends the turn again with the new token", async () => {
    const fetch = vi
      .fn<TurnFetch>()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(new Response(sseBody(['event: reply.delta\ndata: {"text":"Hola"}\n\n']), { status: 200 }));
    const { streamTurn, renewSession, onUnauthorized } = setupRenewing(fetch, "renewed");
    const events: TurnStreamEvent[] = [];

    await streamTurn({ sessionId: "s1", text: "hola", onEvent: (e) => events.push(e) });

    expect(renewSession).toHaveBeenCalledWith({ token: "old-token", account: "learner-1" });
    expect(fetch.mock.calls.map(([, init]) => init.headers.Authorization)).toEqual(["Bearer old-token", "Bearer new-token"]);
    expect(events).toEqual([{ type: "reply.delta", text: "Hola" }]);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("renews only once: a second 401 goes to onUnauthorized", async () => {
    const fetch = vi.fn<TurnFetch>().mockImplementation(async () => unauthorized());
    const { streamTurn, renewSession, onUnauthorized } = setupRenewing(fetch, "renewed");

    await expect(streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {} })).rejects.toMatchObject({ status: 401 });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(renewSession).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledWith("new-token");
  });

  it("tells onUnauthorized when the sign-in has ended", async () => {
    const { streamTurn, onUnauthorized } = setupRenewing(answering(unauthorized()), "ended");

    await expect(streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {} })).rejects.toMatchObject({
      status: 401,
      detail: "Unauthorized",
    });
    expect(onUnauthorized).toHaveBeenCalledWith("old-token");
  });

  it("is a network_error, and keeps the learner signed in, when the renewal gets no answer", async () => {
    const { streamTurn, onUnauthorized } = setupRenewing(answering(unauthorized()), "unreachable");

    await expect(streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {} })).rejects.toMatchObject({
      status: 0,
      detail: "network_error",
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
