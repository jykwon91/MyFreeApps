/**
 * moveKanbanItem, driven through the real endpoints with a fake axios adapter:
 * the card moves before the server answers, stays moved when it agrees, and
 * goes back (with the error rethrown) when it refuses.
 */
import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applicationsApi } from "../store/applicationsApi";
import { moveKanbanItem } from "../store/moveKanbanItem";
import type { KanbanItem } from "../types/kanban/kanban-item";

const CARD: KanbanItem = {
  id: "a1",
  role_title: "Senior Engineer",
  applied_at: null,
  archived: false,
  company_id: "c1",
  company_name: "Acme",
  company_logo_url: null,
  latest_event_type: "applied",
  stage_entered_at: "2026-05-01T00:00:00Z",
  verdict: null,
};
const OTHER: KanbanItem = { ...CARD, id: "b2", role_title: "Staff Engineer", company_id: "c2", company_name: "Globex" };
const OCCURRED = "2026-06-01T00:00:00.000Z";

const sent: InternalAxiosRequestConfig[] = [];
type Reply = { status: number; data: unknown };
let transitionReply: (url: string | undefined) => Promise<Reply> = async () => ({ status: 201, data: { id: "e1" } });
let boardItems: KanbanItem[] = [CARD];

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

type Store = ReturnType<typeof makeStore>;
// The store is built on baseApi, whose state type doesn't know the endpoints applicationsApi injects.
type BoardState = Parameters<ReturnType<typeof applicationsApi.endpoints.listApplicationsKanban.select>>[0];

function board(store: Store): KanbanItem[] | undefined {
  return applicationsApi.endpoints.listApplicationsKanban.select()(store.getState() as unknown as BoardState).data?.items;
}

async function loadBoard(store: Store): Promise<void> {
  await store.dispatch(applicationsApi.endpoints.listApplicationsKanban.initiate());
}

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = async (config) => {
    sent.push(config);
    if (config.method === "post") {
      const reply = await transitionReply(config.url);
      const response = { data: reply.data, status: reply.status, statusText: "", headers: {}, config };
      if (reply.status < 400) return response;
      throw Object.assign(new Error(String(reply.status)), { config, response, isAxiosError: true });
    }
    return { data: { items: boardItems, total: boardItems.length }, status: 200, statusText: "", headers: {}, config };
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
  boardItems = [CARD];
  transitionReply = async () => ({ status: 201, data: { id: "e1" } });
});

describe("moveKanbanItem", () => {
  it("moves the card at once, then posts the move with its idempotency key", async () => {
    const store = makeStore();
    await loadBoard(store);
    let answer: () => void = () => undefined;
    const reply = new Promise<Reply>((resolve) => (answer = () => resolve({ status: 201, data: { id: "e1" } })));
    transitionReply = () => reply;

    const moving = store.dispatch(moveKanbanItem({ applicationId: "a1", target: "offer", idempotencyKey: "k1", occurredAt: OCCURRED }));
    expect(board(store)?.[0]).toMatchObject({ latest_event_type: "offer_received", stage_entered_at: OCCURRED });

    answer();
    await expect(moving).resolves.toEqual({ id: "e1" });
    const post = sent.find((config) => config.method === "post");
    expect(post?.url).toBe("/applications/a1/transitions");
    expect(JSON.parse(String(post?.data))).toEqual({ target_column: "offer", idempotency_key: "k1" });
  });

  it("puts the card back and rethrows when the server refuses", async () => {
    const store = makeStore();
    await loadBoard(store);
    transitionReply = async () => ({ status: 400, data: { detail: "not allowed" } });

    await expect(
      store.dispatch(moveKanbanItem({ applicationId: "a1", target: "closed", idempotencyKey: "k2", occurredAt: OCCURRED })),
    ).rejects.toMatchObject({ status: 400 });
    expect(board(store)?.[0]).toEqual(CARD);
  });

  it("puts back only the refused card when two move at once", async () => {
    boardItems = [CARD, OTHER];
    const store = makeStore();
    await loadBoard(store);
    let answerOther: () => void = () => undefined;
    const otherReply = new Promise<Reply>((resolve) => (answerOther = () => resolve({ status: 201, data: { id: "e2" } })));
    transitionReply = (url) => (url === "/applications/b2/transitions" ? otherReply : Promise.resolve({ status: 400, data: { detail: "not allowed" } }));

    // The other card's move is still waiting on the server when this one is refused.
    const otherMove = store.dispatch(moveKanbanItem({ applicationId: "b2", target: "offer", idempotencyKey: "k4", occurredAt: OCCURRED }));
    await expect(
      store.dispatch(moveKanbanItem({ applicationId: "a1", target: "closed", idempotencyKey: "k5", occurredAt: OCCURRED })),
    ).rejects.toMatchObject({ status: 400 });

    expect(board(store)).toEqual([CARD, { ...OTHER, latest_event_type: "offer_received", stage_entered_at: OCCURRED }]);
    answerOther();
    await expect(otherMove).resolves.toEqual({ id: "e2" });
  });

  it("still posts the move when the board isn't loaded", async () => {
    const store = makeStore();
    await store.dispatch(moveKanbanItem({ applicationId: "a1", target: "interviewing", idempotencyKey: "k3", occurredAt: OCCURRED }));
    expect(sent.filter((config) => config.method === "post")).toHaveLength(1);
    expect(board(store)).toBeUndefined();
  });
});
