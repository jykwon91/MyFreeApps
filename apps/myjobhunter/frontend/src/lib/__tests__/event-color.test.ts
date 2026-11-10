import { describe, it, expect } from "vitest";
import { getEventTypeColor } from "@/lib/event-color";

describe("getEventTypeColor", () => {
  it("returns blue for applied, email_received and follow_up_sent", () => {
    expect(getEventTypeColor("applied")).toBe("blue");
    expect(getEventTypeColor("email_received")).toBe("blue");
    expect(getEventTypeColor("follow_up_sent")).toBe("blue");
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
