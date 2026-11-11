import { describe, expect, it } from "vitest";
import { EVENT_TYPE_LABELS } from "../constants/eventTypeLabels";
import { EVENT_TYPE_TONES } from "../constants/eventTypeTones";
import { KANBAN_COLUMN_LABELS } from "../constants/kanbanColumnLabels";
import { KANBAN_COLUMN_TONES } from "../constants/kanbanColumnTones";
import { toneForEventType } from "../utils/toneForEventType";

describe("status tones", () => {
  it("gives every known event type a tone, so a new one can't ship without", () => {
    expect(Object.keys(EVENT_TYPE_TONES).sort()).toEqual(Object.keys(EVENT_TYPE_LABELS).sort());
  });

  it("gives every kanban column a tone", () => {
    expect(Object.keys(KANBAN_COLUMN_TONES).sort()).toEqual(Object.keys(KANBAN_COLUMN_LABELS).sort());
  });

  it.each(Object.entries(EVENT_TYPE_TONES))("%s reads its tone from the table", (eventType, tone) => {
    expect(toneForEventType(eventType)).toBe(tone);
  });

  it("keeps the colours the web list has always used", () => {
    expect(EVENT_TYPE_TONES).toEqual({
      applied: "info",
      email_received: "info",
      follow_up_sent: "info",
      interview_scheduled: "accent",
      interview_completed: "accent",
      offer_received: "success",
      rejected: "danger",
      withdrawn: "neutral",
      ghosted: "neutral",
      note_added: "neutral",
    });
  });

  it("is neutral for a status this build doesn't know", () => {
    expect(toneForEventType("phone_screen")).toBe("neutral");
  });
});
