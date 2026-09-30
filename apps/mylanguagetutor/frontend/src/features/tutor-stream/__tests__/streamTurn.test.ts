import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { streamTurn } from "@/features/tutor-stream/streamTurn";
import { TurnRequestError } from "@/features/tutor-stream/TurnRequestError";
import type { TurnStreamEvent } from "@/types/tutor/turn-events";

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("streamTurn", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("token", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    localStorage.clear();
  });

  it("POSTs with the bearer token and delivers events across chunk boundaries", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        sseBody([
          'event: turn.started\ndata: {"turn_id":"t1","seq":1}\n\n',
          'event: reply.delta\ndata: {"text":"Ho',
          'la"}\n\nevent: done\ndata: {"status":"complete","usage":{"remaining_fraction":0.9}}\n\n',
        ]),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    const events: TurnStreamEvent[] = [];

    await streamTurn({ sessionId: "s1", text: "hola", onEvent: (e) => events.push(e) });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sessions/s1/turns");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect(JSON.parse(init.body as string)).toEqual({ text: "hola" });
    expect(events.map((e) => e.type)).toEqual(["turn.started", "reply.delta", "done"]);
    expect(events[1]).toEqual({ type: "reply.delta", text: "Hola" });
  });

  it("throws TurnRequestError with the refusal code", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "daily_limit_reached" }), { status: 429 }),
    );

    const error = await streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {} }).catch((e) => e);

    expect(error).toBeInstanceOf(TurnRequestError);
    expect(error).toMatchObject({ status: 429, detail: "daily_limit_reached" });
  });

  it("signs the user out on 401", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 }));

    await expect(streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {} })).rejects.toBeInstanceOf(
      TurnRequestError,
    );
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("maps a failed fetch to network_error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {} })).rejects.toMatchObject({
      status: 0,
      detail: "network_error",
    });
  });
});
