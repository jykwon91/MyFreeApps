/**
 * Tests for the inline edit affordance on EventListItem.
 *
 * Covers:
 * - Pencil visibility rules (interview events only, and only when the
 *   parent supplies an onEditClick callback).
 * - Inline edit mode: read-only summary swaps for the form when
 *   `isEditing` is true.
 * - Save submits via the update mutation with the right payload.
 * - Cancel reverts without submitting.
 * - Escape inside the form fires onCancelEdit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import EventListItem from "../EventListItem";
import type { ApplicationEvent } from "@/types/application-event";

const updateEventMock = vi.fn();

vi.mock("@/lib/applicationsApi", () => ({
  useUpdateApplicationEventMutation: () => [updateEventMock, { isLoading: false }],
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showSuccess: vi.fn(),
    showError: vi.fn(),
    extractErrorMessage: (err: unknown) => (err as { message?: string }).message ?? "error",
  };
});

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
    render(
      <EventListItem
        applicationId="app-1"
        event={makeEvent()}
        onEditClick={() => {}}
      />,
    );
    expect(screen.getByLabelText(/Edit interview details/i)).toBeInTheDocument();
  });

  it("renders the pencil button for interview_completed events", () => {
    render(
      <EventListItem
        applicationId="app-1"
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
          applicationId="app-1"
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
    render(<EventListItem applicationId="app-1" event={makeEvent()} />);
    expect(
      screen.queryByLabelText(/Edit interview details/i),
    ).not.toBeInTheDocument();
  });

  it("does NOT render the pencil button while the event is being edited", () => {
    render(
      <EventListItem
        applicationId="app-1"
        event={makeEvent()}
        isEditing
        onEditClick={() => {}}
        onCancelEdit={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(
      screen.queryByLabelText(/Edit interview details/i),
    ).not.toBeInTheDocument();
  });

  it("fires onEditClick with the event when the pencil is clicked", async () => {
    const handle = vi.fn();
    const event = makeEvent();
    render(
      <EventListItem
        applicationId="app-1"
        event={event}
        onEditClick={handle}
      />,
    );
    await userEvent.click(screen.getByLabelText(/Edit interview details/i));
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith(event);
  });
});

describe("EventListItem — inline edit form", () => {
  const populatedEvent = makeEvent({
    interview_details: {
      type: "video",
      scheduled_at: "2026-05-22T19:00:00.000Z",
      duration_minutes: 45,
      location_or_link: "https://meet.google.com/abc-def",
      interviewer_names: ["Alex Kim", "Jordan Lee"],
    },
    note: "original note",
  });

  beforeEach(() => {
    vi.clearAllMocks();
    updateEventMock.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
  });

  function renderEditing(event = populatedEvent) {
    const onCancelEdit = vi.fn();
    const onSaved = vi.fn();
    const utils = render(
      <EventListItem
        applicationId="app-1"
        event={event}
        isEditing
        onEditClick={() => {}}
        onCancelEdit={onCancelEdit}
        onSaved={onSaved}
      />,
    );
    return { onCancelEdit, onSaved, ...utils };
  }

  it("swaps the read-only summary for the form when isEditing is true", () => {
    renderEditing();
    expect(screen.getByLabelText(/^Type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Scheduled at/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Duration/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Location or link/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Interviewer names/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Note/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save changes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Cancel/i })).toBeInTheDocument();
  });

  it("preloads the form with the existing event's values", () => {
    renderEditing();
    expect(screen.getByLabelText(/^Type/i)).toHaveValue("video");
    expect(screen.getByLabelText(/Duration/i)).toHaveValue(45);
    expect(screen.getByLabelText(/Location or link/i)).toHaveValue(
      "https://meet.google.com/abc-def",
    );
    expect(screen.getByLabelText(/Interviewer names/i)).toHaveValue(
      "Alex Kim\nJordan Lee",
    );
    expect(screen.getByLabelText(/^Note/i)).toHaveValue("original note");
  });

  it("submits via update mutation with the event id and current values", async () => {
    const { onSaved } = renderEditing();
    const note = screen.getByLabelText(/^Note/i);
    await userEvent.clear(note);
    await userEvent.type(note, "updated note");

    await userEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    expect(updateEventMock).toHaveBeenCalledTimes(1);
    const arg = updateEventMock.mock.calls[0][0];
    expect(arg.applicationId).toBe("app-1");
    expect(arg.eventId).toBe("evt-1");
    expect(arg.body.note).toBe("updated note");
    expect(arg.body.interview_details).toMatchObject({
      type: "video",
      duration_minutes: 45,
      location_or_link: "https://meet.google.com/abc-def",
      interviewer_names: ["Alex Kim", "Jordan Lee"],
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("fires onCancelEdit when Cancel is clicked, without submitting", async () => {
    const { onCancelEdit } = renderEditing();
    await userEvent.click(screen.getByRole("button", { name: /^Cancel/i }));
    expect(updateEventMock).not.toHaveBeenCalled();
    expect(onCancelEdit).toHaveBeenCalledTimes(1);
  });

  it("fires onCancelEdit when Escape is pressed inside the form", async () => {
    const { onCancelEdit } = renderEditing();
    await userEvent.click(screen.getByLabelText(/^Type/i));
    await userEvent.keyboard("{Escape}");
    expect(onCancelEdit).toHaveBeenCalledTimes(1);
    expect(updateEventMock).not.toHaveBeenCalled();
  });

  it("blocks save when the type was cleared", async () => {
    renderEditing();
    await userEvent.selectOptions(screen.getByLabelText(/^Type/i), "");
    await userEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    expect(updateEventMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Pick the interview type/i)).toBeInTheDocument();
  });
});
