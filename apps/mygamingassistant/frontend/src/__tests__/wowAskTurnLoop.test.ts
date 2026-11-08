import { describe, expect, it, vi } from "vitest";
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import { runAskTurn } from "@/games/wow-forever/lib/ask/askTurnLoop";
import type { AskToolOutcome } from "@/games/wow-forever/types/ask/askToolOutcome";
import type { AskTurnDeps } from "@/games/wow-forever/types/ask/askTurnDeps";
import type { AskTurnEvents } from "@/games/wow-forever/types/ask/askTurnEvents";
import type { ChatMessage } from "@/games/wow-forever/types/ask/chatMessage";
import type { ChatTurnRequest } from "@/games/wow-forever/types/ask/chatTurnRequest";
import type { ChatTurnResponse } from "@/games/wow-forever/types/ask/chatTurnResponse";

const TICKET_1 = "fixture-ticket-1";
const TICKET_2 = "fixture-ticket-2";

function toolUseReply(id: string, roundsLeft: number, ticket: string): ChatTurnResponse {
  return {
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "Let me look." },
        { type: "tool_use", id, name: ASK_TOOL.searchNpcs, input: { query: "warlock trainer" } },
      ],
    },
    stop_reason: "tool_use",
    ticket,
    rounds_left: roundsLeft,
  };
}

function textReply(text: string, ticket = TICKET_2): ChatTurnResponse {
  return { message: { role: "assistant", content: [{ type: "text", text }] }, stop_reason: "end_turn", ticket, rounds_left: 2 };
}

function last<T>(list: readonly T[]): T {
  return list[list.length - 1];
}

const OUTCOME: AskToolOutcome = {
  content: '{"results":[]}',
  isError: false,
  card: { kind: ASK_CARD.noResults, tool: ASK_TOOL.searchNpcs, query: "warlock trainer" },
};

function events(): AskTurnEvents & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    onMessages: (m) => log.push(`messages:${m.length}`),
    onCard: (id) => log.push(`card:${id}`),
    onToolCalls: (calls) => log.push(`tools:${calls.map((c) => c.id).join(",")}`),
  };
}

describe("runAskTurn", () => {
  it("sends the question with the human check, runs the tool, sends the result with the ticket", async () => {
    const bodies: [ChatTurnRequest, boolean][] = [];
    const replies = [toolUseReply("toolu_a", 3, TICKET_1), textReply("Here they are.")];
    const deps: AskTurnDeps = {
      send: async (body, isNew) => {
        bodies.push([structuredClone(body), isNew]);
        return replies.shift()!;
      },
      runTool: vi.fn(async () => OUTCOME),
    };
    const ev = events();
    const messages = await runAskTurn([], "where's the closest warlock trainer?", deps, ev);

    expect(bodies[0][1]).toBe(true);
    expect(bodies[0][0]).toEqual({ messages: [{ role: "user", content: [{ type: "text", text: "where's the closest warlock trainer?" }] }] });
    expect(bodies[1][1]).toBe(false);
    expect(bodies[1][0].ticket).toBe(TICKET_1);
    expect(last(bodies[1][0].messages)).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_a", content: OUTCOME.content, is_error: false }],
    });
    expect(messages).toHaveLength(4);
    expect(messages[3]).toEqual(textReply("Here they are.").message);
    expect(ev.log).toEqual(["messages:1", "messages:2", "tools:toolu_a", "card:toolu_a", "messages:3", "messages:4"]);
  });

  it("answers straight away when no tool is needed", async () => {
    const deps: AskTurnDeps = { send: async () => textReply("Hello."), runTool: vi.fn() };
    const history: ChatMessage[] = [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "assistant", content: [{ type: "text", text: "Hi!" }] },
    ];
    const messages = await runAskTurn(history, "and again", deps, events());
    expect(messages).toHaveLength(4);
    expect(deps.runTool).not.toHaveBeenCalled();
  });

  it("stops when no rounds are left and drops the unrun tool call", async () => {
    const deps: AskTurnDeps = { send: async () => toolUseReply("toolu_b", 0, TICKET_1), runTool: vi.fn() };
    const messages = await runAskTurn([], "q", deps, events());
    expect(deps.runTool).not.toHaveBeenCalled();
    expect(last(messages)).toEqual({ role: "assistant", content: [{ type: "text", text: "Let me look." }] });
  });

  it("an empty final reply gets the 'couldn't finish' line", async () => {
    const empty: ChatTurnResponse = {
      message: { role: "assistant", content: [{ type: "tool_use", id: "toolu_c", name: ASK_TOOL.findPlaces, input: { query: "x" } }] },
      stop_reason: "max_tokens",
      ticket: TICKET_1,
      rounds_left: 2,
    };
    const messages = await runAskTurn([], "q", { send: async () => empty, runTool: vi.fn() }, events());
    expect(last(messages)).toEqual({ role: "assistant", content: [{ type: "text", text: ASK_COPY.unfinished }] });
  });

  it("runs several calls of one reply together and answers each by id", async () => {
    const two: ChatTurnResponse = {
      message: {
        role: "assistant",
        content: [
          { type: "tool_use", id: "toolu_1", name: ASK_TOOL.findPlaces, input: { query: "Booty Bay" } },
          { type: "tool_use", id: "toolu_2", name: ASK_TOOL.dungeonInfo, input: { query: "Deadmines" } },
        ],
      },
      stop_reason: "tool_use",
      ticket: TICKET_1,
      rounds_left: 2,
    };
    const replies = [two, textReply("Done.")];
    let lastBody: ChatTurnRequest | null = null;
    const deps: AskTurnDeps = {
      send: async (body) => {
        lastBody = body;
        return replies.shift()!;
      },
      runTool: async (c) => ({ content: c.id, isError: false, card: null }),
    };
    await runAskTurn([], "q", deps, events());
    expect(lastBody!.messages[lastBody!.messages.length - 1].content.map((b) => (b.type === "tool_result" ? b.tool_use_id : ""))).toEqual(["toolu_1", "toolu_2"]);
  });

  it("throws relay errors to the caller", async () => {
    const deps: AskTurnDeps = { send: async () => Promise.reject(new Error("429")), runTool: vi.fn() };
    await expect(runAskTurn([], "q", deps, events())).rejects.toThrow("429");
  });
});
