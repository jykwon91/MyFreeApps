import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { afterEach, describe, expect, it } from "vitest";
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { ASK_FAILURE } from "@/games/wow-forever/data/ask/askFailureKinds";
import { ASK_STORAGE_KEY } from "@/games/wow-forever/data/ask/askLimits";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import { askFailureFrom } from "@/games/wow-forever/lib/ask/askFailure";
import { sitePagesMentioned } from "@/games/wow-forever/lib/ask/askFollowUps";
import {
  dungeonHref,
  isRoutablePlace,
  routeToNpcHref,
  routeToPlaceHref,
  zoneMapHref,
} from "@/games/wow-forever/lib/ask/askLinks";
import { completeTurnsOnly, parseStoredChat, readStoredChat, writeStoredChat } from "@/games/wow-forever/lib/ask/askStorage";
import { stepLine } from "@/games/wow-forever/lib/ask/askStepLine";
import { buildTurns, countQuestions, isChatFull } from "@/games/wow-forever/lib/ask/askThread";
import { levelRange } from "@/games/wow-forever/lib/ask/levelRange";
import type { AskOrigin } from "@/games/wow-forever/types/ask/askOrigin";
import type { ChatMessage } from "@/games/wow-forever/types/ask/chatMessage";
import { parseEndpoint } from "@/games/wow-forever/worldMap/trip";

const NOW = Date.parse("2026-11-08T12:00:00Z");

function httpError(status: number, detail: string | null, retryAfter?: string): AxiosError {
  const headers = new AxiosHeaders(retryAfter === undefined ? {} : { "retry-after": retryAfter });
  const response = { status, data: detail === null ? {} : { detail }, headers, statusText: "", config: { headers } } as AxiosResponse;
  return new AxiosError("fail", "ERR_BAD_RESPONSE", undefined, undefined, response);
}

const q = (text: string): ChatMessage => ({ role: "user", content: [{ type: "text", text }] });
const a = (text: string): ChatMessage => ({ role: "assistant", content: [{ type: "text", text }] });
const toolCall = (id: string): ChatMessage => ({
  role: "assistant",
  content: [{ type: "tool_use", id, name: ASK_TOOL.searchNpcs, input: { query: "inn" } }],
});
const toolResult = (id: string): ChatMessage => ({
  role: "user",
  content: [{ type: "tool_result", tool_use_id: id, content: "{}", is_error: false }],
});

describe("askLinks — Route there uses the World Map's own URL format", () => {
  const typed: AskOrigin = { zoneId: 1443, x: 50, y: 50, label: "Desolace", fromMessage: true };
  const saved: AskOrigin = { ...typed, fromMessage: false };

  it("carries From only when the place came from the player's message", () => {
    expect(routeToNpcHref({ poiId: "classic-1803" }, typed)).toBe(
      "/wow-forever/map?to=npc%3Aclassic-1803&from=pt%3A1443%2C50.0%2C50.0&dir=1",
    );
    expect(routeToNpcHref({ poiId: "classic-1803" }, saved)).toBe("/wow-forever/map?to=npc%3Aclassic-1803&dir=1");
    expect(routeToNpcHref({ poiId: "classic-1803" }, null)).toBe("/wow-forever/map?to=npc%3Aclassic-1803&dir=1");
  });

  it("round-trips through the map's own parser", () => {
    const href = new URL(routeToNpcHref({ poiId: "classic-1803" }, typed), "https://example.test");
    expect(parseEndpoint(href.searchParams.get("to") ?? "")).toEqual({ kind: "npc", poiId: "classic-1803" });
    expect(parseEndpoint(href.searchParams.get("from") ?? "")).toEqual({ kind: "point", zoneId: 1443, x: 50, y: 50 });
  });

  it("routes to towns and buildings, opens zones and cities on their map", () => {
    expect(isRoutablePlace({ kind: "town" })).toBe(true);
    expect(isRoutablePlace({ kind: "zone" })).toBe(false);
    expect(routeToPlaceHref({ placeId: "town-1434-booty bay" })).toBe("/wow-forever/map?to=place%3Atown-1434-booty+bay&dir=1");
    expect(zoneMapHref(1443)).toBe("/wow-forever/map?m=1443");
    expect(dungeonHref("deadmines")).toBe("/wow-forever/dungeons/deadmines");
  });
});

describe("askFailureFrom", () => {
  it.each([
    [httpError(429, "chat_daily_limit_reached", "3600"), ASK_FAILURE.dailyLimit, 3600],
    [httpError(429, "chat_ip_daily_limit_reached", "120"), ASK_FAILURE.dailyLimit, 120],
    [httpError(429, "chat_upstream_busy", "60"), ASK_FAILURE.busy, 60],
    [httpError(429, "Too many requests", "30"), ASK_FAILURE.rateLimited, 30],
    [httpError(503, "chat_unavailable"), ASK_FAILURE.unavailable, null],
    [httpError(503, "chat_failed"), ASK_FAILURE.failed, null],
    [httpError(400, "captcha_verification_failed"), ASK_FAILURE.humanCheck, null],
    [httpError(409, "chat_ticket_expired"), ASK_FAILURE.chatOver, null],
    [httpError(422, "chat_too_many_turns"), ASK_FAILURE.chatOver, null],
    [httpError(422, "chat_message_too_long"), ASK_FAILURE.tooLong, null],
    [new AxiosError("Network Error", "ERR_NETWORK"), ASK_FAILURE.network, null],
  ])("maps %#", (err, kind, retryAfterSeconds) => {
    expect(askFailureFrom(err, NOW)).toEqual({ kind, retryAfterSeconds, at: NOW });
  });
});

describe("the thread", () => {
  it("one turn per question; tool results never show; cards follow their call", () => {
    const messages = [q("where?"), toolCall("t1"), toolResult("t1"), a("Here."), q("and?"), a("Sure.")];
    const card = { kind: ASK_CARD.where } as const;
    const turns = buildTurns(messages, { t1: card }, false);
    expect(turns).toEqual([
      { key: 0, question: "where?", answer: "Here.", cards: [{ id: "t1", card }], pending: false },
      { key: 4, question: "and?", answer: "Sure.", cards: [], pending: false },
    ]);
    expect(countQuestions(messages)).toBe(2);
    expect(buildTurns([q("x")], {}, true)[0].pending).toBe(true);
  });

  it("is full at 12 questions, or when one more question with every tool round wouldn't fit", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => [q(`q${i}`), a("a")]).flat();
    expect(isChatFull(twelve.slice(0, 22))).toBe(false);
    expect(isChatFull(twelve)).toBe(true);
    const long = Array.from({ length: 24 }, (_, i) => (i % 2 ? toolResult("t") : toolCall("t")));
    expect(isChatFull([q("x"), ...long, a("y")])).toBe(true);
  });
});

describe("storage", () => {
  afterEach(() => window.sessionStorage.clear());

  it("keeps only finished questions", () => {
    expect(completeTurnsOnly([q("a"), a("b"), q("c"), toolCall("t")])).toEqual([q("a"), a("b")]);
    expect(completeTurnsOnly([q("a")])).toEqual([]);
  });

  it("round-trips, and empties the key on an empty chat", () => {
    const chat = { messages: [q("a"), a("b")], cards: { t: { kind: ASK_CARD.where } as const } };
    writeStoredChat(chat);
    expect(readStoredChat()).toEqual(chat);
    writeStoredChat({ messages: [], cards: {} });
    expect(window.sessionStorage.getItem(ASK_STORAGE_KEY)).toBeNull();
  });

  it("throws away anything malformed", () => {
    expect(parseStoredChat({ messages: [{ role: "system", content: [] }], cards: {} }).messages).toEqual([]);
    expect(parseStoredChat({ messages: [q("a"), a("b")], cards: { x: { kind: "evil" } } }).cards).toEqual({});
    expect(parseStoredChat("nope")).toEqual({ messages: [], cards: {} });
    window.sessionStorage.setItem(ASK_STORAGE_KEY, "{not json");
    expect(readStoredChat()).toEqual({ messages: [], cards: {} });
  });
});

describe("small helpers", () => {
  it("step lines name what is being looked up", () => {
    expect(stepLine({ type: "tool_use", id: "t", name: ASK_TOOL.searchNpcs, input: { query: "inn" } })).toBe(
      "Searching the map for “inn”…",
    );
    expect(stepLine({ type: "tool_use", id: "t", name: "nope" as never, input: {} })).toBe(ASK_COPY.thinking);
  });

  it("follow-up links come from page names in the answer", () => {
    expect(sitePagesMentioned("The site's Professions page and Making gold page cover that.").map((p) => p.path)).toEqual([
      "/wow-forever/professions",
      "/wow-forever/gold",
    ]);
    expect(sitePagesMentioned("No pages here.")).toEqual([]);
  });

  it("level ranges", () => {
    expect(levelRange(16, 16)).toBe("16");
    expect(levelRange(10, 20)).toBe("10–20");
  });
});
