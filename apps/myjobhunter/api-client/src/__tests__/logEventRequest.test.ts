import { describe, expect, it } from "vitest";
import { dateToLocalDateTime, emptyFormValues } from "../utils/interviewEventForm";
import { logEventRequest } from "../utils/logEventRequest";

// 45 s into a minute: a stage move stamped now would be hh:mm:45.
const OPENED = new Date(2026, 10, 19, 14, 5, 12);
const SUBMITTED = new Date(2026, 10, 19, 14, 5, 45, 300);

function formOpenedAt(opened: Date) {
  return { ...emptyFormValues(), event_type: "rejected" as const, occurred_at: dateToLocalDateTime(opened) };
}

describe("logEventRequest's occurred_at", () => {
  it("sends a time left at the form's 'now' as the moment of submitting, to the millisecond", () => {
    const values = formOpenedAt(OPENED);
    const body = logEventRequest(values, values.occurred_at, SUBMITTED);
    expect(body.occurred_at).toBe(SUBMITTED.toISOString());
  });

  it("is later than a stage move made earlier in the same minute", () => {
    const move = new Date(2026, 10, 19, 14, 5, 30);
    const values = formOpenedAt(OPENED);
    const body = logEventRequest(values, values.occurred_at, SUBMITTED);
    expect(new Date(body.occurred_at).getTime()).toBeGreaterThan(move.getTime());
  });

  it("still sends the moment of submitting when the form was opened in an earlier minute", () => {
    const opened = new Date(2026, 10, 19, 14, 2, 50);
    const values = formOpenedAt(opened);
    const body = logEventRequest(values, values.occurred_at, SUBMITTED);
    expect(body.occurred_at).toBe(SUBMITTED.toISOString());
  });

  it("sends the current minute as the moment of submitting even when it was picked by hand", () => {
    const opened = new Date(2026, 10, 19, 13, 0);
    const values = { ...formOpenedAt(opened), occurred_at: dateToLocalDateTime(SUBMITTED) };
    const body = logEventRequest(values, dateToLocalDateTime(opened), SUBMITTED);
    expect(body.occurred_at).toBe(SUBMITTED.toISOString());
  });

  it("sends an earlier time the person picked as that minute", () => {
    const picked = "2026-11-18T09:30";
    const values = { ...formOpenedAt(OPENED), occurred_at: picked };
    const body = logEventRequest(values, dateToLocalDateTime(OPENED), SUBMITTED);
    expect(body.occurred_at).toBe(new Date(2026, 10, 18, 9, 30).toISOString());
  });
});
