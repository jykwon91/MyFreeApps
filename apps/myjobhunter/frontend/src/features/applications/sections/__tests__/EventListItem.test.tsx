/**
 * Tests for the inline edit affordance on EventListItem.
 *
 * The pencil button is shown ONLY when:
 * - `event.event_type` is interview_scheduled or interview_completed
 * - the parent passed `onEditClick`
 *
 * For every other event type the button is absent (no DOM, no aria
 * label) so non-editable rows do not advertise an edit capability.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import EventListItem from "../EventListItem";
import type { ApplicationEvent } from "@/types/application-event";

function makeEvent(overrides: Partial<ApplicationEvent> = {}): ApplicationEvent {
  return {
    id: "evt-1",
    user_id: "user-1",
    application_id: "app-1",
    event_type: "interview_scheduled",
    occurred_at: "2026-05-20T15:00:00.000Z",
    source: "manual",
    email_message_id: null,
    raw_payload: null,
    interview_details: { type: "video" },
    note: null,
    created_at: "2026-05-20T15:00:00.000Z",
    updated_at: "2026-05-20T15:00:00.000Z",
    ...overrides,
  };
}

describe("EventListItem — edit button visibility", () => {
  it("renders the pencil button for interview_scheduled events", () => {
    render(<EventListItem event={makeEvent()} onEditClick={() => {}} />);
    expect(screen.getByLabelText(/Edit interview details/i)).toBeInTheDocument();
  });

  it("renders the pencil button for interview_completed events", () => {
    render(
      <EventListItem
        event={makeEvent({ event_type: "interview_completed" })}
        onEditClick={() => {}}
      />,
    );
    expect(screen.getByLabelText(/Edit interview details/i)).toBeInTheDocument();
  });

  it("does NOT render the pencil button for non-interview events", () => {
    for (const eventType of ["applied", "rejected", "offer_received", "note_added"] as const) {
      const { unmount } = render(
        <EventListItem
          event={makeEvent({ event_type: eventType, interview_details: null })}
          onEditClick={() => {}}
        />,
      );
      expect(
        screen.queryByLabelText(/Edit interview details/i),
      ).not.toBeInTheDocument();
      unmount();
    }
  });

  it("does NOT render the pencil button when onEditClick is omitted", () => {
    render(<EventListItem event={makeEvent()} />);
    expect(
      screen.queryByLabelText(/Edit interview details/i),
    ).not.toBeInTheDocument();
  });

  it("fires onEditClick with the event when the pencil is clicked", async () => {
    const handle = vi.fn();
    const event = makeEvent();
    render(<EventListItem event={event} onEditClick={handle} />);
    await userEvent.click(screen.getByLabelText(/Edit interview details/i));
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith(event);
  });
});
