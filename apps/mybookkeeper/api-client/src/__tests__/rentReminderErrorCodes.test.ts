import { describe, expect, it } from "vitest";
import { mayHaveBeenSentRefusalMessage } from "../utils/mayHaveBeenSentRefusalMessage";
import { reminderMayStillArrive } from "../utils/reminderMayStillArrive";

describe("reminderMayStillArrive", () => {
  it("is true only for a failure that may still have reached the tenant", () => {
    expect(reminderMayStillArrive("sms_outcome_unknown")).toBe(true);
    expect(reminderMayStillArrive("no_phone_confirmation")).toBe(true);
    expect(reminderMayStillArrive("send_interrupted")).toBe(true);
    expect(reminderMayStillArrive("sms_network_error")).toBe(false);
    expect(reminderMayStillArrive("email_send_failed")).toBe(false);
    expect(reminderMayStillArrive(null)).toBe(false);
  });
});

describe("mayHaveBeenSentRefusalMessage", () => {
  it("gives the server's words for Send now's possible-duplicate 409", () => {
    expect(mayHaveBeenSentRefusalMessage({ status: 409, data: { detail: { code: "REMINDER_MAY_HAVE_BEEN_SENT", message: "check" } } })).toBe("check");
  });

  it("is null for the plain already-sent 409 and other errors", () => {
    expect(mayHaveBeenSentRefusalMessage({ status: 409, data: { detail: "This reminder already went out." } })).toBeNull();
    expect(mayHaveBeenSentRefusalMessage({ status: 412, data: { detail: { code: "REMINDER_MAY_HAVE_BEEN_SENT" } } })).toBeNull();
  });
});
