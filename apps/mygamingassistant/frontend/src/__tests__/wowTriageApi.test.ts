/**
 * The triage API client: the key goes only in the X-MGA-Triage-Token header (no cookies, no-store, no
 * referrer), PATCH sends `updated_at` verbatim as If-Match, a 404 or 401 on the stored key locks the
 * screen, and the unlock check with a typed key never locks or stores anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { triageApi, verifyTriageKey } from "@/games/wow-forever/api/triageApi";
import { getTriageKey, getTriageKeySnapshot, lockTriage, unlockTriage } from "@/games/wow-forever/lib/featureRequests/triage/triageKeyStore";
import { triageRequest } from "@/games/wow-forever/lib/featureRequests/triage/triageRequest";
import { clearTriageData, triageStore } from "@/games/wow-forever/lib/featureRequests/triage/triageStore";
import { TRIAGE_KEY, inbox, inboxItem, jsonResponse, triageStory } from "./wowTriageFixtures";

const fetchMock = vi.fn<typeof fetch>();

function lastCall(): { url: string; init: RequestInit; headers: Record<string, string> } {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  if (call === undefined) throw new Error("fetch was not called");
  const init = call[1] ?? {};
  return { url: String(call[0]), init, headers: init.headers as Record<string, string> };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  lockTriage("manual");
  clearTriageData();
  vi.unstubAllGlobals();
});

describe("triageRequest", () => {
  it("sends nothing while locked", async () => {
    const result = await triageRequest({ path: "/inbox", method: "GET" });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("puts the key only in the header, with no cookies, cache or referrer", async () => {
    unlockTriage(TRIAGE_KEY);
    fetchMock.mockResolvedValue(jsonResponse(200, inbox([])));
    await triageRequest({ path: "/inbox", method: "GET" });
    const { url, init, headers } = lastCall();
    expect(url).toBe("/api/wow/feature-requests/triage/inbox");
    expect(url).not.toContain(TRIAGE_KEY);
    expect(headers["X-MGA-Triage-Token"]).toBe(TRIAGE_KEY);
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBe("omit");
    expect(init.referrerPolicy).toBe("no-referrer");
  });

  it.each([404, 401])("locks the screen on a %s", async (status) => {
    unlockTriage(TRIAGE_KEY);
    fetchMock.mockResolvedValue(jsonResponse(status, { detail: "Not Found" }));
    const result = await triageRequest({ path: "/inbox", method: "GET" });
    expect(result.ok).toBe(false);
    expect(getTriageKey()).toBeNull();
    expect(getTriageKeySnapshot()).toEqual({ unlocked: false, lockReason: "rejected" });
  });

  it("does not lock on other failures", async () => {
    unlockTriage(TRIAGE_KEY);
    fetchMock.mockResolvedValue(jsonResponse(429, { detail: "Too Many Requests" }, { "Retry-After": "30" }));
    const result = await triageRequest({ path: "/inbox", method: "GET" });
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ status: 429, retryAfterSeconds: 30 }) });
    expect(getTriageKey()).toBe(TRIAGE_KEY);
  });

  it("checks a typed key without storing it or locking", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { detail: "Not Found" }));
    const result = await verifyTriageKey("typed-key");
    expect(result.ok).toBe(false);
    expect(lastCall().headers["X-MGA-Triage-Token"]).toBe("typed-key");
    expect(getTriageKey()).toBeNull();
    expect(getTriageKeySnapshot().lockReason).not.toBe("rejected");
  });

  it("reports a network failure as no status", async () => {
    unlockTriage(TRIAGE_KEY);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await triageRequest({ path: "/inbox", method: "GET" });
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ status: null }) });
  });
});

describe("triageApi", () => {
  it("PATCH sends updated_at verbatim as If-Match and swaps the saved story into the inbox cache", async () => {
    unlockTriage(TRIAGE_KEY);
    const story = triageStory(1, { status: "submitted", updated_at: "2026-11-05T10:00:00.123456+00:00" });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, inbox([inboxItem(1, story)])));
    await triageStore.dispatch(triageApi.endpoints.getTriageInbox.initiate());

    const saved = { ...story, status: "open" as const, updated_at: "2026-11-05T10:00:01.000000+00:00" };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, saved));
    await triageStore
      .dispatch(triageApi.endpoints.patchTriageStory.initiate({ story, patch: { status: "open" } }))
      .unwrap();

    const { url, init, headers } = lastCall();
    expect(url).toBe(`/api/wow/feature-requests/triage/stories/${story.id}`);
    expect(init.method).toBe("PATCH");
    expect(headers["If-Match"]).toBe("2026-11-05T10:00:00.123456+00:00");
    expect(JSON.parse(String(init.body))).toEqual({ status: "open" });
    const cached = triageApi.endpoints.getTriageInbox.select()(triageStore.getState()).data;
    expect(cached?.items[0]?.story?.updated_at).toBe(saved.updated_at);
  });

  it("refetches both lists after a 412", async () => {
    unlockTriage(TRIAGE_KEY);
    const story = triageStory(1);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, inbox([inboxItem(1, story)])));
    await triageStore.dispatch(triageApi.endpoints.getTriageInbox.initiate());
    const reads = fetchMock.mock.calls.length;

    fetchMock.mockResolvedValueOnce(jsonResponse(412, { detail: "story_changed" }));
    fetchMock.mockResolvedValue(jsonResponse(200, inbox([inboxItem(1, story)])));
    const result = await triageStore.dispatch(triageApi.endpoints.patchTriageStory.initiate({ story, patch: { priority: 1 } }));
    expect(result.error).toEqual(expect.objectContaining({ status: 412, detail: "story_changed" }));
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(reads + 1));
    expect(lastCall().url).toBe("/api/wow/feature-requests/triage/inbox");
  });

  it("clearTriageData drops every cached read", async () => {
    unlockTriage(TRIAGE_KEY);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, inbox([inboxItem(1, triageStory(1))])));
    await triageStore.dispatch(triageApi.endpoints.getTriageInbox.initiate());
    clearTriageData();
    expect(triageApi.endpoints.getTriageInbox.select()(triageStore.getState()).data).toBeUndefined();
  });
});
