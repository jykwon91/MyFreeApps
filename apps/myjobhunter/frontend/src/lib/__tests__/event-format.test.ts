import { describe, it, expect } from "vitest";
import {
  formatEventType,
  getEventTypeColor,
  getEventTypeSortRank,
} from "@/lib/event-format";

describe("formatEventType", () => {
  it("formats all known event types correctly", () => {
    expect(formatEventType("applied")).toBe("Applied");
    expect(formatEventType("email_received")).toBe("Email received");
    expect(formatEventType("interview_scheduled")).toBe("Interview scheduled");
    expect(formatEventType("interview_completed")).toBe("Interview completed");
    expect(formatEventType("rejected")).toBe("Rejected");
    expect(formatEventType("offer_received")).toBe("Offer received");
    expect(formatEventType("withdrawn")).toBe("Withdrawn");
    expect(formatEventType("ghosted")).toBe("Ghosted");
    expect(formatEventType("note_added")).toBe("Note added");
  });

  it("falls back gracefully for unknown event types", () => {
    // Unknown types: capitalize first char, replace underscores with spaces
    expect(formatEventType("phone_screen")).toBe("Phone screen");
    expect(formatEventType("background_check")).toBe("Background check");
    expect(formatEventType("unknown_future_status")).toBe("Unknown future status");
  });

  it("does not return empty string for any input", () => {
    expect(formatEventType("x")).not.toBe("");
    expect(formatEventType("")).not.toBe(undefined);
  });
});

describe("getEventTypeColor", () => {
  it("returns blue for applied and email_received", () => {
    expect(getEventTypeColor("applied")).toBe("blue");
    expect(getEventTypeColor("email_received")).toBe("blue");
  });

  it("returns purple for interview stages", () => {
    expect(getEventTypeColor("interview_scheduled")).toBe("purple");
    expect(getEventTypeColor("interview_completed")).toBe("purple");
  });

  it("returns green for offer_received", () => {
    expect(getEventTypeColor("offer_received")).toBe("green");
  });

  it("returns red for rejected", () => {
    expect(getEventTypeColor("rejected")).toBe("red");
  });

  it("returns gray for withdrawn, ghosted, note_added", () => {
    expect(getEventTypeColor("withdrawn")).toBe("gray");
    expect(getEventTypeColor("ghosted")).toBe("gray");
    expect(getEventTypeColor("note_added")).toBe("gray");
  });

  it("returns gray (neutral) for unknown event types", () => {
    expect(getEventTypeColor("phone_screen")).toBe("gray");
    expect(getEventTypeColor("totally_unknown")).toBe("gray");
  });
});

describe("getEventTypeSortRank", () => {
  it("returns 999 for null and undefined", () => {
    expect(getEventTypeSortRank(null)).toBe(999);
    expect(getEventTypeSortRank(undefined)).toBe(999);
  });

  it("applied sorts before interview stages", () => {
    expect(getEventTypeSortRank("applied")).toBeLessThan(
      getEventTypeSortRank("interview_scheduled"),
    );
  });

  it("interview stages sort before offer_received", () => {
    expect(getEventTypeSortRank("interview_completed")).toBeLessThan(
      getEventTypeSortRank("offer_received"),
    );
  });

  it("offer_received sorts before rejected", () => {
    expect(getEventTypeSortRank("offer_received")).toBeLessThan(
      getEventTypeSortRank("rejected"),
    );
  });

  it("rejected sorts before null", () => {
    expect(getEventTypeSortRank("rejected")).toBeLessThan(
      getEventTypeSortRank(null),
    );
  });

  it("unknown event types sort before null but after known types", () => {
    const unknownRank = getEventTypeSortRank("phone_screen");
    expect(unknownRank).toBeLessThan(getEventTypeSortRank(null));
    expect(unknownRank).toBeGreaterThan(getEventTypeSortRank("applied"));
  });
});
