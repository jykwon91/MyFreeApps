import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resumeRefinementApi } from "../store/resumeRefinementApi";

const started = { id: "new-session", status: "preparing", turns: [] };
const shown = { id: "s1", status: "active", target_index: 0, turn_count: 4, pending_proposal: "First rewrite", turns: [] };
const next = { id: "s1", status: "active", target_index: 1, turn_count: 6, pending_proposal: "Second rewrite", turns: [] };

interface Sent {
  call: string;
  body: unknown;
}
let sent: Sent[] = [];
let answer: (config: InternalAxiosRequestConfig) => { status: number; data: unknown } = () => ({ status: 200, data: started });

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    sent.push({ call: `${config.method} ${config.url}`, body: typeof config.data === "string" ? JSON.parse(config.data) : config.data });
    const { status, data } = answer(config);
    if (status >= 400) {
      return Promise.reject(Object.assign(new Error("failed"), { config, response: { status, data, statusText: "", headers: {}, config }, isAxiosError: true }));
    }
    const response = { data, status, statusText: "", headers: {}, config };
    // A reload is slow, as on a phone with a weak signal: the screen must not wait on it.
    return config.method === "get" ? new Promise((resolve) => setTimeout(() => resolve(response), 50)) : Promise.resolve(response);
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent = [];
});

function makeStore() {
  return configureStore({
    reducer: { [resumeRefinementApi.reducerPath]: resumeRefinementApi.reducer },
    middleware: (getDefault) => getDefault().concat(resumeRefinementApi.middleware),
  });
}

type Store = ReturnType<typeof makeStore>;

/** A store whose cache holds `shown` and that the screen is subscribed to, as it was before the tap. */
async function storeShowing(): Promise<Store> {
  const store = makeStore();
  await store.dispatch(resumeRefinementApi.util.upsertQueryData("getRefinementSession", "s1", shown as never));
  store.dispatch(resumeRefinementApi.endpoints.getRefinementSession.initiate("s1"));
  return store;
}

/** Lets every pending microtask run, but no timer: the soonest a second tap could arrive. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const selectS1 = resumeRefinementApi.endpoints.getRefinementSession.select("s1");
const SEEN = { seen_target_index: 0, seen_turn_count: 4 };

describe("startRefinementSession", () => {
  it("puts the started session in the cache so it shows without a first fetch", async () => {
    answer = () => ({ status: 200, data: started });
    const store = makeStore();

    await store.dispatch(resumeRefinementApi.endpoints.startRefinementSession.initiate({ source_resume_job_id: "job-1" }));

    const select = resumeRefinementApi.endpoints.getRefinementSession.select("new-session");
    await vi.waitFor(() => expect(select(store.getState()).data).toEqual(started));
    expect(sent.map((s) => s.call)).toEqual(["post /resume-refinement/sessions"]);
  });
});

describe("answering a suggestion", () => {
  const answers = [
    ["acceptPending", "accept", {}],
    ["acceptFlagged", "accept-flagged", {}],
    ["skipTarget", "skip", {}],
    ["supplyCustomRewrite", "custom", { user_text: "Mine" }],
    ["requestAlternative", "alternative", { hint: "Shorter" }],
  ] as const;

  it.each(answers)("%s names the suggestion on screen and shows the next one the moment it answers", async (endpoint, path, extra) => {
    answer = () => ({ status: 200, data: next });
    const store = await storeShowing();

    // By the time a second tap could arrive, the screen must already show the next suggestion, not the one just
    // answered while a reload is still on its way.
    await store.dispatch(resumeRefinementApi.endpoints[endpoint].initiate({ id: "s1", ...SEEN, ...extra } as never));
    await nextTask();
    expect(selectS1(store.getState()).data).toEqual(next);

    expect(sent).toEqual([{ call: `post /resume-refinement/sessions/s1/${path}`, body: { ...SEEN, ...extra } }]);
  });

  it("keeps the next suggestion when a reload that left before the answer comes back after it", async () => {
    // The reload in flight when the user tapped answers with the session as it was before the tap.
    answer = (config) => (config.method === "get" ? { status: 200, data: shown } : { status: 200, data: next });
    const store = await storeShowing();
    const poll = store.dispatch(resumeRefinementApi.endpoints.getRefinementSession.initiate("s1", { forceRefetch: true }));

    await store.dispatch(resumeRefinementApi.endpoints.acceptPending.initiate({ id: "s1", ...SEEN }));
    await poll;

    expect(sent.map((s) => s.call)).toEqual(["get /resume-refinement/sessions/s1", "post /resume-refinement/sessions/s1/accept"]);
    expect(selectS1(store.getState()).data).toEqual(next);
  });

  it("still takes a reload that is as new as what is shown", async () => {
    const moved = { ...shown, target_index: 2, pending_proposal: "Third rewrite" };
    answer = () => ({ status: 200, data: moved });
    const store = await storeShowing();

    await store.dispatch(resumeRefinementApi.endpoints.getRefinementSession.initiate("s1", { forceRefetch: true }));
    expect(selectS1(store.getState()).data).toEqual(moved);
  });

  it("reloads the session after a failed answer, which may have gone through", async () => {
    answer = (config) =>
      config.method === "get" ? { status: 200, data: next } : { status: 409, data: { detail: { code: "REFINEMENT_SUGGESTION_CHANGED", message: "x" } } };
    const store = await storeShowing();

    await store.dispatch(resumeRefinementApi.endpoints.acceptPending.initiate({ id: "s1", ...SEEN }));

    await vi.waitFor(() => expect(selectS1(store.getState()).data).toEqual(next));
    expect(sent.map((s) => s.call)).toEqual(["post /resume-refinement/sessions/s1/accept", "get /resume-refinement/sessions/s1"]);
  });
});
