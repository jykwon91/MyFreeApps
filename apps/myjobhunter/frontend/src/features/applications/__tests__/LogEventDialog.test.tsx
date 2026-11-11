/**
 * Tests for the interview_details path in LogEventDialog (create mode only).
 *
 * Covers:
 * - Interview sub-form only appears when event_type is interview_*.
 * - Submitting an interview event without picking a type shows an error.
 * - Submitting a non-interview event sends `interview_details: null`.
 * - Submitting a full interview event serialises the JSONB-safe payload.
 * - Optional sub-fields are omitted when empty (no empty strings reach the API).
 *
 * The edit-mode path was moved out of this component into the inline edit
 * surface inside EventListItem (see EventListItem.test.tsx for those tests).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const logEventMock = vi.fn();

vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useLogApplicationEventMutation: () => [logEventMock, { isLoading: false }],
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

import { INTERVIEWER_NAME_MAX_LENGTH, INTERVIEWERS_MAX } from "@myjobhunter/api-client/constants/interviewDetailLimits";
import { interviewerNameTooLongMessage, tooManyInterviewersMessage } from "@myjobhunter/api-client/constants/interviewerProblems";
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

  it("keeps a note over the backend's limit, says so, and doesn't log it", async () => {
    renderDialog();
    const note = screen.getByLabelText("Note");
    expect(note).not.toHaveAttribute("maxLength");
    // 😀 is one character to the backend, so 5000 fit and a 5001st is too many.
    fireEvent.change(note, { target: { value: "😀".repeat(5001) } });
    await userEvent.click(screen.getByRole("button", { name: /Log event/i }));

    expect(await screen.findByText("Keep this to 5,000 characters or fewer.")).toBeInTheDocument();
    expect(note).toHaveValue("😀".repeat(5001));
    expect(logEventMock).not.toHaveBeenCalled();

    fireEvent.change(note, { target: { value: "😀".repeat(5000) } });
    await userEvent.click(screen.getByRole("button", { name: /Log event/i }));
    expect(logEventMock).toHaveBeenCalledTimes(1);
  });

  it("keeps an interview location over the backend's limit, says so, and doesn't log it", async () => {
    renderDialog();
    await userEvent.selectOptions(screen.getByLabelText(/^Event/i), "interview_scheduled");
    await userEvent.selectOptions(screen.getByLabelText(/Type/i), "video");
    const location = screen.getByLabelText(/Location or link/i);
    fireEvent.change(location, { target: { value: "😀".repeat(1025) } });
    await userEvent.click(screen.getByRole("button", { name: /Log event/i }));

    expect(await screen.findByText("Keep this to 1,024 characters or fewer.")).toBeInTheDocument();
    expect(location).toHaveValue("😀".repeat(1025));
    expect(logEventMock).not.toHaveBeenCalled();
  });

  it("keeps too many interviewers, or one name over the limit, says so, and doesn't log it", async () => {
    renderDialog();
    await userEvent.selectOptions(screen.getByLabelText(/^Event/i), "interview_scheduled");
    await userEvent.selectOptions(screen.getByLabelText(/Type/i), "video");
    const names = screen.getByLabelText(/Interviewer names/i);

    const tooMany = Array.from({ length: INTERVIEWERS_MAX + 1 }, (_, i) => `Person ${i}`).join("\n");
    fireEvent.change(names, { target: { value: tooMany } });
    await userEvent.click(screen.getByRole("button", { name: /Log event/i }));
    expect(await screen.findByText(tooManyInterviewersMessage(INTERVIEWERS_MAX))).toBeInTheDocument();
    expect(names).toHaveValue(tooMany);

    fireEvent.change(names, { target: { value: "😀".repeat(INTERVIEWER_NAME_MAX_LENGTH + 1) } });
    await userEvent.click(screen.getByRole("button", { name: /Log event/i }));
    expect(await screen.findByText(interviewerNameTooLongMessage(INTERVIEWER_NAME_MAX_LENGTH))).toBeInTheDocument();
    expect(logEventMock).not.toHaveBeenCalled();
  });
});
