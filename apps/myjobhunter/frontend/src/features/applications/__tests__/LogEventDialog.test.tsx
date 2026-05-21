/**
 * Tests for the interview_details path in LogEventDialog.
 *
 * Covers:
 * - Interview sub-form only appears when event_type is interview_*.
 * - Submitting an interview event without picking a type shows an error.
 * - Submitting a non-interview event sends `interview_details: null`.
 * - Submitting a full interview event serialises the JSONB-safe payload.
 * - Optional sub-fields are omitted when empty (no empty strings reach the API).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const logEventMock = vi.fn();
const updateEventMock = vi.fn();

vi.mock("@/lib/applicationsApi", () => ({
  useLogApplicationEventMutation: () => [logEventMock, { isLoading: false }],
  useUpdateApplicationEventMutation: () => [updateEventMock, { isLoading: false }],
}));

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => children,
    Close: ({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) => {
      void asChild;
      return <>{children}</>;
    },
  };
});

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showSuccess: vi.fn(),
    showError: vi.fn(),
    extractErrorMessage: (err: unknown) => (err as { message?: string }).message ?? "error",
  };
});

import LogEventDialog from "../LogEventDialog";

function renderDialog() {
  return render(
    <LogEventDialog applicationId="app-1" open={true} onOpenChange={() => {}} />,
  );
}

describe("LogEventDialog — interview_details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logEventMock.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
    updateEventMock.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
  });

  it("does not show interview fields for non-interview event types", () => {
    renderDialog();
    expect(screen.queryByText(/Interview details/i)).not.toBeInTheDocument();
  });

  it("reveals interview fields when the operator picks interview_scheduled", async () => {
    renderDialog();
    await userEvent.selectOptions(
      screen.getByLabelText(/^Event/i),
      "interview_scheduled",
    );
    expect(screen.getByText(/Interview details/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
  });

  it("hides interview fields again when switching back to a non-interview type", async () => {
    renderDialog();
    const eventSelect = screen.getByLabelText(/^Event/i);
    await userEvent.selectOptions(eventSelect, "interview_scheduled");
    expect(screen.getByText(/Interview details/i)).toBeInTheDocument();
    await userEvent.selectOptions(eventSelect, "applied");
    expect(screen.queryByText(/Interview details/i)).not.toBeInTheDocument();
  });

  it("sends interview_details: null on non-interview events", async () => {
    renderDialog();
    // Default event_type is "applied"; just submit.
    await userEvent.click(screen.getByRole("button", { name: /Log event/i }));
    expect(logEventMock).toHaveBeenCalledTimes(1);
    const arg = logEventMock.mock.calls[0][0];
    expect(arg.body.event_type).toBe("applied");
    expect(arg.body.interview_details).toBeNull();
  });

  it("blocks submit on an interview event when type is unset", async () => {
    renderDialog();
    await userEvent.selectOptions(
      screen.getByLabelText(/^Event/i),
      "interview_scheduled",
    );
    await userEvent.click(screen.getByRole("button", { name: /Log event/i }));
    expect(logEventMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Pick the interview type/i)).toBeInTheDocument();
  });

  it("submits a full interview payload with only the non-empty optional fields", async () => {
    renderDialog();

    await userEvent.selectOptions(
      screen.getByLabelText(/^Event/i),
      "interview_scheduled",
    );
    await userEvent.selectOptions(screen.getByLabelText(/Type/i), "video");
    await userEvent.type(
      screen.getByLabelText(/Duration/i),
      "45",
    );
    await userEvent.type(
      screen.getByLabelText(/Location or link/i),
      "https://meet.google.com/abc-def-ghi",
    );
    await userEvent.type(
      screen.getByLabelText(/Interviewer names/i),
      "Alex Kim\nJordan Lee\n  \n",
    );

    await userEvent.click(screen.getByRole("button", { name: /Log event/i }));

    expect(logEventMock).toHaveBeenCalledTimes(1);
    const body = logEventMock.mock.calls[0][0].body;
    expect(body.event_type).toBe("interview_scheduled");
    expect(body.interview_details).toEqual({
      type: "video",
      duration_minutes: 45,
      location_or_link: "https://meet.google.com/abc-def-ghi",
      interviewer_names: ["Alex Kim", "Jordan Lee"],
    });
    // Untouched sub-field (scheduled_at) must be omitted, not sent as "".
    expect(body.interview_details).not.toHaveProperty("scheduled_at");
  });

  it("rejects a duration outside the 1..1440 range", async () => {
    renderDialog();
    await userEvent.selectOptions(
      screen.getByLabelText(/^Event/i),
      "interview_completed",
    );
    await userEvent.selectOptions(screen.getByLabelText(/Type/i), "onsite");
    await userEvent.type(screen.getByLabelText(/Duration/i), "9999");
    await userEvent.click(screen.getByRole("button", { name: /Log event/i }));
    expect(logEventMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Between 1 and 1440/i)).toBeInTheDocument();
  });
});

describe("LogEventDialog — edit mode", () => {
  const existingEvent = {
    id: "event-1",
    user_id: "user-1",
    application_id: "app-1",
    event_type: "interview_scheduled" as const,
    occurred_at: "2026-05-20T15:00:00.000Z",
    source: "manual" as const,
    email_message_id: null,
    raw_payload: null,
    interview_details: {
      type: "video" as const,
      scheduled_at: "2026-05-22T19:00:00.000Z",
      duration_minutes: 45,
      location_or_link: "https://meet.google.com/abc-def",
      interviewer_names: ["Alex Kim", "Jordan Lee"],
    },
    note: "original note",
    created_at: "2026-05-20T15:00:00.000Z",
    updated_at: "2026-05-20T15:00:00.000Z",
  };

  function renderEdit() {
    return render(
      <LogEventDialog
        applicationId="app-1"
        open={true}
        onOpenChange={() => {}}
        mode="edit"
        eventToEdit={existingEvent}
      />,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    logEventMock.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
    updateEventMock.mockReturnValue({ unwrap: () => Promise.resolve(undefined) });
  });

  it("uses the edit title and submit copy", () => {
    renderEdit();
    expect(screen.getByText(/Edit interview details/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save changes/i })).toBeInTheDocument();
  });

  it("hides the event_type select and the top-level When field in edit mode", () => {
    renderEdit();
    expect(screen.queryByLabelText(/^Event/i)).not.toBeInTheDocument();
    // The interview's own "Scheduled at" field is still visible; the
    // top-level "When" (occurred_at) is what should be hidden.
    expect(screen.queryByLabelText(/^When/i)).not.toBeInTheDocument();
  });

  it("preloads the form with the existing event's values", () => {
    renderEdit();
    expect(screen.getByLabelText(/Type/i)).toHaveValue("video");
    expect(screen.getByLabelText(/Duration/i)).toHaveValue(45);
    expect(screen.getByLabelText(/Location or link/i)).toHaveValue(
      "https://meet.google.com/abc-def",
    );
    expect(screen.getByLabelText(/Interviewer names/i)).toHaveValue(
      "Alex Kim\nJordan Lee",
    );
    expect(screen.getByLabelText(/^Note/i)).toHaveValue("original note");
  });

  it("submits via update mutation and forwards eventId", async () => {
    renderEdit();
    const note = screen.getByLabelText(/^Note/i);
    await userEvent.clear(note);
    await userEvent.type(note, "updated note");

    await userEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    expect(updateEventMock).toHaveBeenCalledTimes(1);
    expect(logEventMock).not.toHaveBeenCalled();
    const arg = updateEventMock.mock.calls[0][0];
    expect(arg.applicationId).toBe("app-1");
    expect(arg.eventId).toBe("event-1");
    expect(arg.body.note).toBe("updated note");
    expect(arg.body.interview_details).toMatchObject({
      type: "video",
      duration_minutes: 45,
      location_or_link: "https://meet.google.com/abc-def",
      interviewer_names: ["Alex Kim", "Jordan Lee"],
    });
  });
});
