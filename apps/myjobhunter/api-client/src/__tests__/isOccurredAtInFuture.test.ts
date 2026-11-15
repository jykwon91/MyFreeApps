import { describe, expect, it } from "vitest";
import { dateToLocalDateTime } from "../utils/interviewEventForm";
import { isOccurredAtInFuture } from "../utils/isOccurredAtInFuture";

const NOW = new Date(2026, 10, 15, 12, 30);
const local = (offsetMinutes: number): string =>
  dateToLocalDateTime(new Date(NOW.getTime() + offsetMinutes * 60_000));

describe("isOccurredAtInFuture", () => {
  it("is true for a later time", () => {
    expect(isOccurredAtInFuture(local(60), NOW)).toBe(true);
    expect(isOccurredAtInFuture(local(7 * 24 * 60), NOW)).toBe(true);
  });

  it("is false for now and for the past", () => {
    expect(isOccurredAtInFuture(local(0), NOW)).toBe(false);
    expect(isOccurredAtInFuture(local(-60), NOW)).toBe(false);
  });

  it("is false for a blank or unreadable value", () => {
    expect(isOccurredAtInFuture("", NOW)).toBe(false);
    expect(isOccurredAtInFuture("not a date", NOW)).toBe(false);
  });
});
