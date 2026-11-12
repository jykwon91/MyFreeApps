import { describe, expect, it, vi } from "vitest";
import { createStreamTurn } from "../utils/createStreamTurn";
import { TurnRequestError } from "../errors/TurnRequestError";
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
