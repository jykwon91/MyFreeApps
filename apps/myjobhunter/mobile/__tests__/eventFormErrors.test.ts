import { OCCURRED_AT_IN_FUTURE_MESSAGE } from "@myjobhunter/api-client/constants/eventTimeMessages";
import { dateToLocalDateTime, emptyFormValues } from "@myjobhunter/api-client/utils/interviewEventForm";
import { eventFormErrors } from "../src/lib/eventFormErrors";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("eventFormErrors: when", () => {
  it("rejects a time in the future", () => {
    const values = { ...emptyFormValues(), occurred_at: dateToLocalDateTime(new Date(Date.now() + 7 * DAY_MS)) };
    expect(eventFormErrors(values, false).occurred_at).toBe(OCCURRED_AT_IN_FUTURE_MESSAGE);
  });

  it("accepts now and the past", () => {
    expect(eventFormErrors(emptyFormValues(), false).occurred_at).toBeUndefined();
    const past = { ...emptyFormValues(), occurred_at: dateToLocalDateTime(new Date(Date.now() - DAY_MS)) };
    expect(eventFormErrors(past, false).occurred_at).toBeUndefined();
  });

  it("allows a future interview time in its own field", () => {
    const values = {
      ...emptyFormValues(),
      event_type: "interview_scheduled" as const,
      interview_type: "video" as const,
      interview_scheduled_at: dateToLocalDateTime(new Date(Date.now() + 7 * DAY_MS)),
    };
    expect(eventFormErrors(values, true)).toEqual({});
  });
});
