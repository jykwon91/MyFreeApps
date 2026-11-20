import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADD_APPLICATION_FORM_PROBLEMS } from "../constants/addApplicationForm";
import { addApplicationFormProblems } from "../utils/addApplicationFormProblems";
import { appliedAtFromLocalDate } from "../utils/appliedAtFromLocalDate";
import { buildApplicationCreateRequest } from "../utils/buildApplicationCreateRequest";
import { emptyAddApplicationFormValues } from "../utils/emptyAddApplicationFormValues";
import { isLocalDateInFuture } from "../utils/isLocalDateInFuture";

// Late evening local time: a UTC "today" would already be tomorrow west of Greenwich.
const NOW = new Date(2026, 10, 19, 23, 30);
const CONTEXT = { companyId: "c1", sourceUrl: null, jdText: "" };

describe("the add form's 'Applied on' day", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at today's local date", () => {
    expect(emptyAddApplicationFormValues().applied_on).toBe("2026-11-19");
  });

  it("is required and can't be after today", () => {
    const values = { ...emptyAddApplicationFormValues(), role_title: "Engineer" };
    expect(addApplicationFormProblems(values)).toEqual({});
    expect(addApplicationFormProblems({ ...values, applied_on: "2026-11-05" })).toEqual({});
    expect(addApplicationFormProblems({ ...values, applied_on: "" }).applied_on).toBe(
      ADD_APPLICATION_FORM_PROBLEMS.appliedOnRequired,
    );
    expect(addApplicationFormProblems({ ...values, applied_on: "2026-11-20" }).applied_on).toBe(
      ADD_APPLICATION_FORM_PROBLEMS.appliedOnInFuture,
    );
  });

  it("compares local calendar days", () => {
    expect(isLocalDateInFuture("2026-11-19")).toBe(false);
    expect(isLocalDateInFuture("2026-11-20")).toBe(true);
    expect(isLocalDateInFuture("2025-12-31")).toBe(false);
  });

  it("sends today as now, and an earlier day as that day's local midnight", () => {
    expect(appliedAtFromLocalDate("2026-11-19")).toBe(NOW.toISOString());
    expect(appliedAtFromLocalDate("2026-11-05")).toBe(new Date(2026, 10, 5).toISOString());
  });

  it("goes in the create request as applied_at", () => {
    const values = { ...emptyAddApplicationFormValues(), role_title: "Engineer", applied_on: "2026-11-05" };
    expect(buildApplicationCreateRequest(values, CONTEXT).applied_at).toBe(new Date(2026, 10, 5).toISOString());
    const today = { ...values, applied_on: "2026-11-19" };
    expect(buildApplicationCreateRequest(today, CONTEXT).applied_at).toBe(NOW.toISOString());
  });
});
