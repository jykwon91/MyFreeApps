import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_FAILURE } from "@/games/wow-forever/data/ask/askFailureKinds";
import { ASK_PHASE } from "@/games/wow-forever/data/ask/askPhases";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import { useAskChat } from "@/games/wow-forever/hooks/ask/useAskChat";
import type { AskTurnstileState } from "@/games/wow-forever/types/ask/askTurnstileState";
import type { ChatTurnResponse } from "@/games/wow-forever/types/ask/chatTurnResponse";
import { askToolData } from "./wowAskWorld";

const sendChatTurn = vi.hoisted(() => vi.fn());
vi.mock("@/games/wow-forever/api/wowChatApi", () => ({ sendChatTurn }));

const TOKEN = "turnstile-fixture-token";
const TICKET = "fixture-ticket";

const turnstile: AskTurnstileState = {
  widget: {
    needsToken: true,
    token: TOKEN,
    resetKey: 0,
    expired: false,
    onVerify: () => undefined,
    onExpire: () => undefined,
    reset: () => undefined,
  },
  takeToken: async () => TOKEN,
};

function toolUse(): ChatTurnResponse {
  return {
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id: "toolu_fixture", name: ASK_TOOL.searchNpcs, input: { query: "warlock trainer", from_zone: "Desolace" } }],
    },
    stop_reason: "tool_use",
    ticket: TICKET,
    rounds_left: 3,
  };
}

function text(t: string): ChatTurnResponse {
  return { message: { role: "assistant", content: [{ type: "text", text: t }] }, stop_reason: "end_turn", ticket: TICKET, rounds_left: 2 };
}

function rateLimited(): AxiosError {
  const headers = new AxiosHeaders({ "retry-after": "42" });
  const response = { status: 429, data: { detail: "Too many requests" }, headers, statusText: "", config: { headers } } as AxiosResponse;
  return new AxiosError("429", "ERR_BAD_REQUEST", undefined, undefined, response);
}

const data = askToolData();

beforeEach(() => {
  sendChatTurn.mockReset();
  window.sessionStorage.clear();
});
afterEach(() => window.sessionStorage.clear());

describe("useAskChat", () => {
  it("asks, runs the tool, shows its card and the answer", async () => {
    sendChatTurn.mockResolvedValueOnce(toolUse()).mockResolvedValueOnce(text("Your nearest trainers are in the Eastern Kingdoms."));
    const { result } = renderHook(() => useAskChat(data, turnstile));

    act(() => result.current.ask("where's the closest warlock trainer if i'm in desolace"));
    expect(result.current.phase).not.toBe(ASK_PHASE.idle);
    await waitFor(() => expect(result.current.phase).toBe(ASK_PHASE.idle));

    expect(sendChatTurn).toHaveBeenCalledTimes(2);
    expect(sendChatTurn.mock.calls[0][1]).toBe(TOKEN);
    expect(sendChatTurn.mock.calls[1][1]).toBe("");
    expect(sendChatTurn.mock.calls[1][0].ticket).toBe(TICKET);
    const [turn] = result.current.turns;
    expect(turn.answer).toBe("Your nearest trainers are in the Eastern Kingdoms.");
    expect(turn.cards[0].card.kind).toBe(ASK_CARD.npcs);
    expect(result.current.failure).toBeNull();
    expect(window.sessionStorage.length).toBe(1);
  });

  it("a follow-up question carries the last answer's ticket, also after a reload", async () => {
    sendChatTurn.mockResolvedValueOnce(text("First answer.")).mockResolvedValueOnce(text("Second answer."));
    const first = renderHook(() => useAskChat(data, turnstile));
    act(() => first.result.current.ask("where is booty bay"));
    await waitFor(() => expect(first.result.current.turns[0]?.answer).toBe("First answer."));
    expect(sendChatTurn.mock.calls[0][0].ticket).toBeUndefined();
    first.unmount();

    // A new page load reads the chat (and its ticket) back from sessionStorage.
    const { result } = renderHook(() => useAskChat(data, turnstile));
    act(() => result.current.ask("and the nearest flight master?"));
    await waitFor(() => expect(result.current.turns[1]?.answer).toBe("Second answer."));
    expect(sendChatTurn.mock.calls[1][0].ticket).toBe(TICKET);
    expect(sendChatTurn.mock.calls[1][1]).toBe(TOKEN);
  });

  it("a failure rolls the chat back and Retry asks the same question", async () => {
    sendChatTurn.mockRejectedValueOnce(rateLimited());
    const { result } = renderHook(() => useAskChat(data, turnstile));
    act(() => result.current.ask("where is booty bay"));
    await waitFor(() => expect(result.current.failure).not.toBeNull());
    expect(result.current.failure).toMatchObject({ kind: ASK_FAILURE.rateLimited, retryAfterSeconds: 42 });
    expect(result.current.turns).toEqual([]);
    expect(result.current.failedQuestion).toBe("where is booty bay");

    sendChatTurn.mockResolvedValueOnce(text("It's on the south tip of Stranglethorn."));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.turns[0]?.answer).toBe("It's on the south tip of Stranglethorn."));
    expect(result.current.failure).toBeNull();
  });

  it("Cancel puts the question back in the box and keeps the chat as it was", async () => {
    sendChatTurn.mockImplementationOnce(
      (_body: unknown, _token: string, signal: AbortSignal) =>
        new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const { result } = renderHook(() => useAskChat(data, turnstile));
    act(() => result.current.ask("slow question"));
    await waitFor(() => expect(result.current.phase).toBe(ASK_PHASE.thinking));
    act(() => result.current.cancel());
    await waitFor(() => expect(result.current.phase).toBe(ASK_PHASE.idle));
    expect(result.current.draft).toBe("slow question");
    expect(result.current.turns).toEqual([]);
    expect(result.current.failure).toBeNull();
  });

  it("New chat clears, and Undo brings it back", async () => {
    sendChatTurn.mockResolvedValueOnce(text("Hi."));
    const { result } = renderHook(() => useAskChat(data, turnstile));
    act(() => result.current.ask("hello"));
    await waitFor(() => expect(result.current.turns).toHaveLength(1));
    act(() => result.current.newChat());
    expect(result.current.turns).toEqual([]);
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undoNewChat());
    expect(result.current.turns).toHaveLength(1);
  });

  it("ignores empty questions and a second question while one is being answered", async () => {
    sendChatTurn.mockResolvedValueOnce(text("One."));
    const { result } = renderHook(() => useAskChat(data, turnstile));
    act(() => result.current.ask("   "));
    expect(sendChatTurn).not.toHaveBeenCalled();
    act(() => {
      result.current.ask("first");
      result.current.ask("second");
    });
    await waitFor(() => expect(result.current.phase).toBe(ASK_PHASE.idle));
    expect(result.current.turns.map((t) => t.question)).toEqual(["first"]);
  });
});
