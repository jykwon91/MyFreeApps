import { describe, it, expect } from "vitest";
import { columnForEventType } from "../kanban-stage-mapping";

describe("columnForEventType", () => {
  it("maps applied to the applied column", () => {
    expect(columnForEventType("applied")).toBe("applied");
  });

  it("collapses both interview events into the interviewing column", () => {
    expect(columnForEventType("interview_scheduled")).toBe("interviewing");
    expect(columnForEventType("interview_completed")).toBe("interviewing");
  });

  it("maps offer_received to offer", () => {
    expect(columnForEventType("offer_received")).toBe("offer");
  });

  it("collapses rejected/withdrawn/ghosted into closed", () => {
    expect(columnForEventType("rejected")).toBe("closed");
    expect(columnForEventType("withdrawn")).toBe("closed");
    expect(columnForEventType("ghosted")).toBe("closed");
  });

  it("returns applied for null (no events yet)", () => {
    expect(columnForEventType(null)).toBe("applied");
  });

  it("returns applied for unknown event types (forward-compatible)", () => {
    expect(columnForEventType("not_a_real_event_type")).toBe("applied");
  });

  it("does NOT classify activity event types as a stage", () => {
    // These should never appear in the lateral subquery output, but if
    // an extension data path wedges one in, we fall back to applied.
    expect(columnForEventType("note_added")).toBe("applied");
    expect(columnForEventType("email_received")).toBe("applied");
    expect(columnForEventType("follow_up_sent")).toBe("applied");
  });
});
