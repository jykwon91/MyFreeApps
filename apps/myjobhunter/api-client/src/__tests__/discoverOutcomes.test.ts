import { describe, expect, it } from "vitest";
import type { DiscoveryFetchResult } from "../types/discovery/discovery-fetch-result";
import { describeRefreshError } from "../utils/describeRefreshError";
import { describeRefreshResult } from "../utils/describeRefreshResult";
import { discoverFailureMessage } from "../utils/discoverFailureMessage";

function result(overrides: Partial<DiscoveryFetchResult> = {}): DiscoveryFetchResult {
  return { fetch_id: "f1", status: "success", fetched_count: 12, new_count: 3, updated_count: 0, duration_ms: 10, error_message: null, ...overrides };
}

describe("describeRefreshResult", () => {
  it("reports what a refresh fetched", () => {
    expect(describeRefreshResult(result())).toEqual({ message: "Fetched 12 postings (3 new)", isError: false, addedPostings: true });
    expect(describeRefreshResult(result({ fetched_count: 1, new_count: 1 }))).toEqual({ message: "Fetched 1 posting (1 new)", isError: false, addedPostings: true });
  });

  it("says what went wrong with a fetch that hit a problem", () => {
    expect(describeRefreshResult(result({ status: "partial", error_message: "Page 2 timed out" }))).toEqual({ message: "Page 2 timed out", isError: true, addedPostings: true });
  });

  it("still says a failed fetch failed when it gave no reason", () => {
    expect(describeRefreshResult(result({ status: "error", new_count: 0 }))).toEqual({ message: "Refresh failed", isError: true, addedPostings: false });
  });

  it("says no postings were added when the fetch found nothing new", () => {
    expect(describeRefreshResult(result({ new_count: 0 })).addedPostings).toBe(false);
  });

  it("reports a partial fetch with no reason as what it fetched", () => {
    expect(describeRefreshResult(result({ status: "partial" })).isError).toBe(false);
  });
});

describe("describeRefreshError", () => {
  it("turns the per-IP limit into a friendly retry", () => {
    expect(describeRefreshError({ status: 429, data: { detail: "Too many attempts" } })).toBe("You've refreshed a lot — try again in a few minutes");
    expect(describeRefreshError({ status: 429, data: null })).toBe("You've refreshed a lot — try again in a few minutes");
  });

  it("keeps JSearch's own quota message", () => {
    const detail = "JSearch monthly quota reached — upgrade your RapidAPI plan or wait until it resets.";
    expect(describeRefreshError({ status: 429, data: { detail } })).toBe(detail);
  });

  it("shows the server's reason for other failures, else a generic one", () => {
    expect(describeRefreshError({ status: 503, data: { detail: "JSearch isn't configured" } })).toBe("JSearch isn't configured");
    expect(describeRefreshError({ status: "FETCH_ERROR", data: undefined })).toBe("Refresh failed");
  });
});

describe("discoverFailureMessage", () => {
  it("prefers the server's reason, else the fallback", () => {
    expect(discoverFailureMessage({ status: 409, data: { detail: "Already promoted" } }, "Couldn't add")).toBe("Already promoted");
    expect(discoverFailureMessage({ status: 422, data: { detail: [{ msg: "bad" }] } }, "Couldn't add")).toBe("Couldn't add");
    expect(discoverFailureMessage(new Error("Network Error"), "Couldn't add")).toBe("Couldn't add");
  });
});
