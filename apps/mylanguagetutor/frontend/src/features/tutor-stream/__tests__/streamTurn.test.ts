// The stream reading and refusal mapping are tested in the api-client
// (createStreamTurn / readTurnStream); this covers only the web's wiring.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { streamTurn } from "@/features/tutor-stream/streamTurn";
import { TurnRequestError } from "@mylanguagetutor/api-client/errors/TurnRequestError";

const notifyAuthChange = vi.hoisted(() => vi.fn());

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  notifyAuthChange,
}));

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("streamTurn (web)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("token", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    notifyAuthChange.mockReset();
    localStorage.clear();
  });

  it("POSTs to /api with the stored bearer token through the browser's fetch", async () => {
    fetchMock.mockResolvedValue(
      new Response(sseBody(['event: reply.delta\ndata: {"text":"Hola"}\n\n']), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    const onEvent = vi.fn();

    await streamTurn({ sessionId: "s1", text: "hola", onEvent });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sessions/s1/turns");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect(onEvent).toHaveBeenCalledWith({ type: "reply.delta", text: "Hola" });
  });

  it("signs the user out on 401", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 }));

    await expect(streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {} })).rejects.toBeInstanceOf(
      TurnRequestError,
    );
    expect(localStorage.getItem("token")).toBeNull();
    expect(notifyAuthChange).toHaveBeenCalledTimes(1);
  });

  it("leaves the next user signed in when the 401 answers the previous user's token", async () => {
    fetchMock.mockImplementation(async () => {
      // Another user signs in while the turn is in flight.
      localStorage.setItem("token", "next-user-token");
      return new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 });
    });

    await expect(streamTurn({ sessionId: "s1", text: "hola", onEvent: () => {} })).rejects.toBeInstanceOf(
      TurnRequestError,
    );
    expect(localStorage.getItem("token")).toBe("next-user-token");
    expect(notifyAuthChange).not.toHaveBeenCalled();
  });
});
