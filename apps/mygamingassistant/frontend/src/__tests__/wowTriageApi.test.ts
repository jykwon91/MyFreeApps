/**
 * The triage API client: every call goes through the app's shared axios instance (so the operator's
 * Bearer session is attached and a 401 signs out like any other call), with the fetch adapter for
 * no-store / no referrer / keepalive writes; PATCH sends `updated_at` verbatim as If-Match; failures map
 * to TriageApiError; signing out drops every cached triage row, after held-back writes are sent.
 */
import type { AxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectCachedTriage, triageApi } from "@/games/wow-forever/api/triageApi";
import { triageRequest } from "@/games/wow-forever/lib/featureRequests/triage/triageRequest";
import { signOut, signOutAfterSaving } from "@/lib/auth";
import { registerPendingWrites } from "@/lib/pendingWrites";
import { store } from "@/lib/store";
import { axiosFailure, axiosOk, dropSession, inbox, inboxItem, signInOperator, triageStory } from "./wowTriageFixtures";

const requestMock = vi.hoisted(() => vi.fn<(config: AxiosRequestConfig) => Promise<unknown>>());

vi.mock("@/lib/api", () => ({ default: { request: requestMock } }));

function lastConfig(): AxiosRequestConfig {
  const call = requestMock.mock.calls[requestMock.mock.calls.length - 1];
  if (call === undefined) throw new Error("api.request was not called");
  return call[0];
}

beforeEach(() => {
  requestMock.mockReset();
  signInOperator();
});
afterEach(() => {
  signOut();
  dropSession();
});

describe("triageRequest", () => {
  it("reads through the shared client with no cache, no referrer and no keepalive", async () => {
    requestMock.mockResolvedValue(axiosOk(inbox([])));
    const result = await triageRequest({ path: "/inbox", method: "GET" });
    expect(result).toEqual({ ok: true, data: inbox([]) });
    expect(lastConfig()).toEqual(
      expect.objectContaining({
        url: "/wow/feature-requests/triage/inbox",
        method: "GET",
        adapter: "fetch",
        fetchOptions: { cache: "no-store", referrerPolicy: "no-referrer", keepalive: false },
      }),
    );
    expect(lastConfig().headers).toBeUndefined();
  });

  it("sends writes with keepalive and If-Match verbatim", async () => {
    requestMock.mockResolvedValue(axiosOk({}));
    await triageRequest({ path: "/stories/x", method: "PATCH", body: { hidden: true }, ifMatch: "2026-11-05T10:00:00.123456+00:00" });
    const config = lastConfig();
    expect(config.data).toEqual({ hidden: true });
    expect(config.headers).toEqual({ "If-Match": "2026-11-05T10:00:00.123456+00:00" });
    expect(config.fetchOptions).toEqual(expect.objectContaining({ keepalive: true }));
  });

  it("keeps a 429's Retry-After for the undo queue", async () => {
    requestMock.mockRejectedValue(axiosFailure(429, { detail: "Too Many Requests" }, { "retry-after": "30" }));
    const result = await triageRequest({ path: "/inbox", method: "GET" });
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ status: 429, retryAfterSeconds: 30 }) });
  });

  it.each([401, 403, 404])("maps a %s to its status and detail", async (status) => {
    requestMock.mockRejectedValue(axiosFailure(status, { detail: "feature_request_not_found" }));
    const result = await triageRequest({ path: "/stories/x", method: "PATCH", body: { hidden: true }, ifMatch: "v" });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ status, detail: "feature_request_not_found", data: { detail: "feature_request_not_found" } }),
    });
  });

  it("reports a network failure as no status", async () => {
    requestMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await triageRequest({ path: "/inbox", method: "GET" });
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ status: undefined }) });
  });
});

describe("triageApi", () => {
  it("PATCH sends updated_at as If-Match and swaps the saved story into the inbox cache", async () => {
    const story = triageStory(1, { status: "submitted", updated_at: "2026-11-05T10:00:00.123456+00:00" });
    requestMock.mockResolvedValueOnce(axiosOk(inbox([inboxItem(1, story)])));
    const read = store.dispatch(triageApi.endpoints.getTriageInbox.initiate());
    await read;

    const saved = { ...story, status: "open" as const, updated_at: "2026-11-05T10:00:01.000000+00:00" };
    requestMock.mockResolvedValueOnce(axiosOk(saved));
    await store.dispatch(triageApi.endpoints.patchTriageStory.initiate({ story, patch: { status: "open" } })).unwrap();

    const config = lastConfig();
    expect(config.url).toBe(`/wow/feature-requests/triage/stories/${story.id}`);
    expect(config.method).toBe("PATCH");
    expect(config.headers).toEqual({ "If-Match": "2026-11-05T10:00:00.123456+00:00" });
    expect(config.data).toEqual({ status: "open" });
    expect(selectCachedTriage(store.getState()).inbox?.items[0]?.story?.updated_at).toBe(saved.updated_at);
    read.unsubscribe();
  });

  it("refetches the inbox after a 412", async () => {
    const story = triageStory(1);
    requestMock.mockResolvedValueOnce(axiosOk(inbox([inboxItem(1, story)])));
    const read = store.dispatch(triageApi.endpoints.getTriageInbox.initiate());
    await read;
    const calls = requestMock.mock.calls.length;

    requestMock.mockRejectedValueOnce(axiosFailure(412, { detail: "story_changed" }));
    requestMock.mockResolvedValue(axiosOk(inbox([inboxItem(1, story)])));
    const result = await store.dispatch(triageApi.endpoints.patchTriageStory.initiate({ story, patch: { priority: 1 } }));
    expect(result.error).toEqual(expect.objectContaining({ status: 412, detail: "story_changed" }));
    await vi.waitFor(() => expect(requestMock.mock.calls.length).toBeGreaterThan(calls + 1));
    expect(lastConfig().url).toBe("/wow/feature-requests/triage/inbox");
    read.unsubscribe();
  });

  it("signing out drops every cached triage row", async () => {
    requestMock.mockResolvedValueOnce(axiosOk(inbox([inboxItem(1, triageStory(1))])));
    const read = store.dispatch(triageApi.endpoints.getTriageInbox.initiate());
    await read;
    expect(selectCachedTriage(store.getState()).inbox).toBeDefined();
    signOut();
    expect(selectCachedTriage(store.getState()).inbox).toBeUndefined();
    read.unsubscribe();
  });
});

describe("signOutAfterSaving", () => {
  it("sends held-back writes while still signed in, then clears the session", async () => {
    const tokenDuringFlush: (string | null)[] = [];
    const unregister = registerPendingWrites(async () => {
      tokenDuringFlush.push(window.localStorage.getItem("token"));
    });
    await signOutAfterSaving();
    unregister();
    expect(tokenDuringFlush).toHaveLength(1);
    expect(tokenDuringFlush[0]).not.toBeNull();
    expect(window.localStorage.getItem("token")).toBeNull();
  });

  it("still signs out when a flush fails, and an unregistered flush is not called", async () => {
    const gone = vi.fn(async () => undefined);
    registerPendingWrites(gone)();
    const unregister = registerPendingWrites(() => Promise.reject(new Error("offline")));
    await signOutAfterSaving();
    unregister();
    expect(gone).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("token")).toBeNull();
  });
});
