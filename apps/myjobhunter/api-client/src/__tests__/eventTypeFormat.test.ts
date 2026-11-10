import { describe, expect, it } from "vitest";
import { formatEventType } from "../utils/formatEventType";
import { isApplicationEventType } from "../utils/isApplicationEventType";

describe("formatEventType", () => {
  it("formats every known event type", () => {
    expect(formatEventType("applied")).toBe("Applied");
    expect(formatEventType("email_received")).toBe("Email received");
    expect(formatEventType("interview_scheduled")).toBe("Interview scheduled");
    expect(formatEventType("interview_completed")).toBe("Interview completed");
    expect(formatEventType("rejected")).toBe("Rejected");
    expect(formatEventType("offer_received")).toBe("Offer received");
    expect(formatEventType("withdrawn")).toBe("Withdrawn");
    expect(formatEventType("ghosted")).toBe("Ghosted");
    expect(formatEventType("note_added")).toBe("Note added");
    expect(formatEventType("follow_up_sent")).toBe("Follow-up sent");
  });

  it("reads sensibly for an event type added on the backend later", () => {
    expect(formatEventType("phone_screen")).toBe("Phone screen");
    expect(formatEventType("background_check")).toBe("Background check");
  });

  it("never returns undefined", () => {
    expect(formatEventType("x")).toBe("X");
    expect(formatEventType("")).toBe("");
  });

  it("doesn't treat inherited object keys as event types", () => {
    expect(isApplicationEventType("toString")).toBe(false);
    expect(formatEventType("constructor")).toBe("Constructor");
  });
});

