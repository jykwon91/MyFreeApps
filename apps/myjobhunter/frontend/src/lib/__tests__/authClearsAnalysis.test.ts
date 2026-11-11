import { beforeEach, describe, expect, it, vi } from "vitest";
import { analysisStarted, setLastAnalysis } from "@myjobhunter/api-client/store/jobAnalysisSlice";
import type { JobAnalysis } from "@myjobhunter/api-client/types/job-analysis/job-analysis";

// Only the network is faked: the real store and the real auth client run, so this proves the
// wiring between them, not a mock of it.
vi.mock("@platform/core/lib/api", () => ({
  default: { post: vi.fn() },
}));

import api from "@platform/core/lib/api";
import { signIn, signOut } from "@/lib/auth";
import { store } from "@/lib/store";

const post = vi.mocked(api.post);

function analysis(): JobAnalysis {
  return {
    id: "an-a",
    user_id: "user-a",
    source_url: null,
    jd_text: "Account A's JD",
    fingerprint: "f",
    extracted: {
      title: "Staff Engineer",
      company: "Stripe",
      location: null,
      remote_type: null,
      posted_salary_min: null,
      posted_salary_max: null,
      posted_salary_currency: null,
      posted_salary_period: null,
      summary: null,
    },
    verdict: "strong_fit",
    verdict_summary: "",
    dimensions: [],
    red_flags: [],
    green_flags: [],
    total_tokens_in: 0,
    total_tokens_out: 0,
    total_cost_usd: 0,
    applied_application_id: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  };
}

/** Account A analyzed a job, then sent another, still running, which replaced that result with its wait. */
function accountAWasAnalyzing(): void {
  store.dispatch(analysisStarted({ requestId: "req-1", source: "text", startedAt: 0 }));
  store.dispatch(setLastAnalysis({ requestId: "req-1", analysis: analysis() }));
  store.dispatch(analysisStarted({ requestId: "req-2", source: "url", startedAt: 0 }));
  expect(store.getState().jobAnalysis.pending?.requestId).toBe("req-2");
}

describe("the last analysis on the web, across accounts", () => {
  beforeEach(() => {
    localStorage.clear();
    post.mockReset();
  });

  it("is dropped, with the one still running, on sign-out", () => {
    accountAWasAnalyzing();

    signOut();

    expect(store.getState().jobAnalysis).toEqual({ lastResult: null, pending: null, failure: null });
    // A's running analysis answering now lands nowhere.
    store.dispatch(setLastAnalysis({ requestId: "req-2", analysis: analysis() }));
    expect(store.getState().jobAnalysis.lastResult).toBeNull();
  });

  it("is dropped when someone else signs in in the same tab, as after the session expired", async () => {
    accountAWasAnalyzing();
    post.mockResolvedValueOnce({ data: { access_token: "account-b.jwt", token_type: "bearer" } });

    await signIn("b@example.com", "password");

    expect(store.getState().jobAnalysis).toEqual({ lastResult: null, pending: null, failure: null });
    // A's running analysis answering now lands nowhere.
    store.dispatch(setLastAnalysis({ requestId: "req-2", analysis: analysis() }));
    expect(store.getState().jobAnalysis.lastResult).toBeNull();
  });
});
