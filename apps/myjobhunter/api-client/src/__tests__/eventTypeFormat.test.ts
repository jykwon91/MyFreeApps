import { describe, expect, it } from "vitest";
import { formatEventType } from "../utils/formatEventType";
import { getEventTypeSortRank } from "../utils/getEventTypeSortRank";
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

describe("getEventTypeSortRank", () => {
  it("sorts no status last", () => {
    expect(getEventTypeSortRank(null)).toBe(999);
    expect(getEventTypeSortRank(undefined)).toBe(999);
  });

  it("orders applied, interviewing, offer, then closed out", () => {
    const order = ["applied", "interview_scheduled", "interview_completed", "offer_received", "rejected"];
    const ranks = order.map(getEventTypeSortRank);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(getEventTypeSortRank("rejected")).toBeLessThan(getEventTypeSortRank(null));
  });

  it("sorts an unknown status after known ones and before no status", () => {
    const unknown = getEventTypeSortRank("phone_screen");
    expect(unknown).toBeGreaterThan(getEventTypeSortRank("follow_up_sent"));
    expect(unknown).toBeLessThan(getEventTypeSortRank(null));
  });
});
