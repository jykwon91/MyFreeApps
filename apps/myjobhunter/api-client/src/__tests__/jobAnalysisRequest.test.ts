import { describe, expect, it } from "vitest";
import { JOB_ANALYSIS_ERRORS } from "../constants/jobAnalysis";
import { baseApi } from "@platform/core/store/baseApi";
import reducer, {
  analysisCancelled,
  analysisFailed,
  analysisFailureDismissed,
  analysisStarted,
  clearLastAnalysis,
  isPendingAnalysis,
  markLastAnalysisApplied,
  setLastAnalysis,
} from "../store/jobAnalysisSlice";
import type { JobAnalysis } from "../types/job-analysis/job-analysis";
import { analysisFailureFrom } from "../utils/analysisFailureFrom";
import { describeAnalyzeError } from "../utils/describeAnalyzeError";

const failed = (status: number, detail = "Couldn't analyze this job: Error code: 529 - overloaded_error") => ({ status, data: { detail } });

function analysis(id: string): JobAnalysis {
  return {
    id,
    user_id: "u1",
    source_url: null,
    jd_text: "JD",
    fingerprint: "f",
    extracted: {
      title: null,
      company: null,
      location: null,
      remote_type: null,
      posted_salary_min: null,
      posted_salary_max: null,
      posted_salary_currency: null,
      posted_salary_period: null,
      summary: null,
    },
    verdict: "stretch",
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

describe("describeAnalyzeError", () => {
  it("says a link failed the way reading one for an application does", () => {
    expect(describeAnalyzeError(failed(504), "url")).toBe("The page took too long to load. Try again or paste the description text.");
    expect(describeAnalyzeError(failed(400), "url")).toBe("That URL doesn't look right. Make sure it starts with http:// or https://.");
    expect(describeAnalyzeError(new Error("Network Error"), "url")).toBe("Couldn't fetch that URL. Paste the description text instead.");
  });

  it("says the same about the rate limit whichever way the job came in", () => {
    const limited = "You've looked up a lot of job postings recently. Try again in a few minutes.";
    expect(describeAnalyzeError(failed(429, "Too many attempts"), "url")).toBe(limited);
    expect(describeAnalyzeError(failed(429, "Too many attempts"), "text")).toBe(limited);
  });

  it("never shows the AI provider's raw error for pasted text", () => {
    expect(describeAnalyzeError(failed(502), "text")).toBe(JOB_ANALYSIS_ERRORS.aiFailed);
    expect(describeAnalyzeError(failed(500), "text")).toBe(JOB_ANALYSIS_ERRORS.failed);
    expect(describeAnalyzeError(new Error("Network Error"), "text")).toBe(JOB_ANALYSIS_ERRORS.failed);
  });
});

describe("analysisFailureFrom", () => {
  it("keeps a sign-in-walled link as one to paste instead, and says why otherwise", () => {
    const walled = { status: 422, data: { detail: "auth_required" } };
    expect(analysisFailureFrom(walled, "url").authRequired).toBe(true);
    expect(analysisFailureFrom(walled, "text").authRequired).toBe(false);
    expect(analysisFailureFrom(failed(502), "text")).toEqual({ source: "text", authRequired: false, message: JOB_ANALYSIS_ERRORS.aiFailed });
  });
});

describe("jobAnalysisSlice", () => {
  const started = (requestId: string) => analysisStarted({ requestId, source: "text", startedAt: 0 });
  const finished = (requestId: string, id: string) => setLastAnalysis({ requestId, analysis: analysis(id) });
  const after = (...actions: Parameters<typeof reducer>[1][]) => actions.reduce(reducer, reducer(undefined, { type: "init" }));

  it("waits for the analysis sent, then remembers its result until it's cleared", () => {
    const waiting = after(started("r1"));
    expect(waiting.pending).toEqual({ requestId: "r1", source: "text", startedAt: 0 });
    expect(isPendingAnalysis(waiting, "r1")).toBe(true);

    const state = reducer(waiting, finished("r1", "a1"));
    expect(state.lastResult?.id).toBe("a1");
    expect(state.pending).toBeNull();
    expect(reducer(state, clearLastAnalysis()).lastResult).toBeNull();
  });

  it("ignores an older analysis that answers after a newer one was sent", () => {
    const state = after(started("old"), started("new"), finished("old", "a-old"));
    expect(state.lastResult).toBeNull();
    expect(state.pending?.requestId).toBe("new");
    expect(reducer(state, finished("new", "a-new")).lastResult?.id).toBe("a-new");
  });

  it("ignores an answer after the wait was cancelled or cleared", () => {
    expect(after(started("r1"), analysisCancelled(), finished("r1", "a1")).lastResult).toBeNull();
    expect(after(started("r1"), clearLastAnalysis(), finished("r1", "a1")).lastResult).toBeNull();
  });

  const blocked = { source: "url" as const, authRequired: true, message: "needs a sign-in" };
  const failed = (requestId: string) => analysisFailed({ requestId, failure: blocked });

  it("stops waiting and keeps why when the pending analysis fails, but not for an older one", () => {
    const state = after(started("r1"), failed("r1"));
    expect(state.pending).toBeNull();
    expect(state.failure).toEqual(blocked);

    const stale = after(started("r1"), failed("r0"));
    expect(stale.pending?.requestId).toBe("r1");
    expect(stale.failure).toBeNull();
  });

  it("forgets why it failed once shown, on a new analysis, Cancel, clear and the cache reset", () => {
    const failedOnce = after(started("r1"), failed("r1"));
    expect(reducer(failedOnce, analysisFailureDismissed()).failure).toBeNull();
    expect(reducer(failedOnce, started("r2")).failure).toBeNull();
    expect(reducer(failedOnce, analysisCancelled()).failure).toBeNull();
    expect(reducer(failedOnce, clearLastAnalysis()).failure).toBeNull();
    expect(reducer(failedOnce, baseApi.util.resetApiState()).failure).toBeNull();
  });

  it("ignores a failure after the wait was cancelled or the account changed", () => {
    expect(after(started("r1"), analysisCancelled(), failed("r1")).failure).toBeNull();
    expect(after(started("r1"), baseApi.util.resetApiState(), failed("r1")).failure).toBeNull();
  });

  it("forgets the result and the running analysis when the API cache is reset, as every sign-in and sign-out does", () => {
    const reset = baseApi.util.resetApiState();
    expect(after(started("r1"), finished("r1", "a1"), reset)).toEqual({ lastResult: null, pending: null, failure: null });
    const signedOutMidWait = after(started("r2"), reset, finished("r2", "a2"));
    expect(signedOutMidWait).toEqual({ lastResult: null, pending: null, failure: null });
  });

  it("marks the last result as added to applications", () => {
    const state = after(started("r1"), finished("r1", "a1"), markLastAnalysisApplied({ analysisId: "a1", applicationId: "app-1" }));
    expect(state.lastResult?.applied_application_id).toBe("app-1");
  });

  it("leaves a newer result alone when an older one is added", () => {
    const state = after(started("r2"), finished("r2", "a2"), markLastAnalysisApplied({ analysisId: "a1", applicationId: "app-1" }));
    expect(state.lastResult?.applied_application_id).toBeNull();
    expect(after(markLastAnalysisApplied({ analysisId: "a1", applicationId: "app-1" })).lastResult).toBeNull();
  });
});
