/**
 * Unit tests for the welcome-manual email-to-guest dialog.
 *
 * Verifies the 3 result states render distinctly and the per-status footer
 * actions match the spec:
 *   - sent    → green success, "Done" closes
 *   - failed  → amber error, "Try again" returns to the form WITH email
 *               pre-filled + "Close"
 *   - skipped → blue info, "Close" only (no "Try again" — retry always skips)
 * Plus: send button disabled until a valid email is entered, and — for a
 * by-the-room manual — until the host has picked which room the guest is in.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WelcomeManualEmailDialog from "@/app/features/welcome-manuals/WelcomeManualEmailDialog";
import { SHARED_ROOM_OPTION } from "@/shared/lib/welcome-manual-constants";
import type { WelcomeManualRoomResponse } from "@/shared/types/welcome-manual/welcome-manual-room-response";
import type { WelcomeManualSendResponse } from "@/shared/types/welcome-manual/welcome-manual-send-response";

const emailMutationMock = vi.fn();
const showErrorMock = vi.fn();

vi.mock("@/shared/lib/toast-store", () => ({
  showError: (msg: string) => showErrorMock(msg),
  showSuccess: vi.fn(),
}));

vi.mock("@/shared/store/welcomeManualsApi", () => ({
  useEmailWelcomeManualMutation: vi.fn(() => [emailMutationMock, { isLoading: false }]),
}));

function makeSend(overrides: Partial<WelcomeManualSendResponse>): WelcomeManualSendResponse {
  return {
    id: "send-1",
    manual_id: "m-1",
    recipient_email: "guest@example.com",
    recipient_name: null,
    status: "sent",
    error_reason: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const ROOMS: WelcomeManualRoomResponse[] = [
  {
    id: "room-1",
    manual_id: "m-1",
    name: "Front bedroom",
    display_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const onClose = vi.fn();

describe("WelcomeManualEmailDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables the send button until a valid email is entered", async () => {
    render(<WelcomeManualEmailDialog manualId="m-1" rooms={[]} onClose={onClose} />);
    const sendBtn = screen.getByTestId("welcome-manual-email-send");
    expect(sendBtn).toBeDisabled();

    const input = screen.getByTestId("welcome-manual-email-input");
    await userEvent.type(input, "not-an-email");
    expect(sendBtn).toBeDisabled();

    await userEvent.clear(input);
    await userEvent.type(input, "guest@example.com");
    expect(sendBtn).not.toBeDisabled();
  });

  it("renders the sent state with a Done button on status=sent", async () => {
    emailMutationMock.mockReturnValue({
      unwrap: () => Promise.resolve(makeSend({ status: "sent" })),
    });
    render(<WelcomeManualEmailDialog manualId="m-1" rooms={[]} onClose={onClose} />);
    await userEvent.type(screen.getByTestId("welcome-manual-email-input"), "guest@example.com");
    await userEvent.click(screen.getByTestId("welcome-manual-email-send"));

    await waitFor(() => {
      expect(screen.getByTestId("welcome-manual-email-sent")).toBeInTheDocument();
    });
    expect(screen.getByText("Guide sent!")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-manual-email-done")).toBeInTheDocument();
    expect(screen.queryByTestId("welcome-manual-email-try-again")).not.toBeInTheDocument();
  });

  it("renders the failed state with error reason + Try again that pre-fills email", async () => {
    emailMutationMock.mockReturnValue({
      unwrap: () =>
        Promise.resolve(
          makeSend({ status: "failed", error_reason: "Mailbox does not exist" }),
        ),
    });
    render(<WelcomeManualEmailDialog manualId="m-1" rooms={[]} onClose={onClose} />);
    await userEvent.type(screen.getByTestId("welcome-manual-email-input"), "guest@example.com");
    await userEvent.click(screen.getByTestId("welcome-manual-email-send"));

    await waitFor(() => {
      expect(screen.getByTestId("welcome-manual-email-failed")).toBeInTheDocument();
    });
    expect(screen.getByText("I couldn't send that")).toBeInTheDocument();
    expect(screen.getByText("Mailbox does not exist")).toBeInTheDocument();

    // Try again returns to the form with the email still filled.
    await userEvent.click(screen.getByTestId("welcome-manual-email-try-again"));
    expect(screen.getByTestId("welcome-manual-email-form")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-manual-email-input")).toHaveValue("guest@example.com");
  });

  it("renders the skipped state with a Close button and NO Try again", async () => {
    emailMutationMock.mockReturnValue({
      unwrap: () => Promise.resolve(makeSend({ status: "skipped" })),
    });
    render(<WelcomeManualEmailDialog manualId="m-1" rooms={[]} onClose={onClose} />);
    await userEvent.type(screen.getByTestId("welcome-manual-email-input"), "guest@example.com");
    await userEvent.click(screen.getByTestId("welcome-manual-email-send"));

    await waitFor(() => {
      expect(screen.getByTestId("welcome-manual-email-skipped")).toBeInTheDocument();
    });
    expect(screen.getByText("Email isn't set up yet")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-manual-email-close")).toBeInTheDocument();
    expect(screen.queryByTestId("welcome-manual-email-try-again")).not.toBeInTheDocument();
    expect(screen.queryByTestId("welcome-manual-email-done")).not.toBeInTheDocument();
  });

  it("shows an error toast when the request throws (transport error)", async () => {
    emailMutationMock.mockReturnValue({
      unwrap: () => Promise.reject(new Error("network")),
    });
    render(<WelcomeManualEmailDialog manualId="m-1" rooms={[]} onClose={onClose} />);
    await userEvent.type(screen.getByTestId("welcome-manual-email-input"), "guest@example.com");
    await userEvent.click(screen.getByTestId("welcome-manual-email-send"));

    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalled();
    });
    // Still on the form — no result state rendered.
    expect(screen.getByTestId("welcome-manual-email-form")).toBeInTheDocument();
  });

  describe("room picker", () => {
    it("is absent for a whole-place manual", () => {
      render(<WelcomeManualEmailDialog manualId="m-1" rooms={[]} onClose={onClose} />);
      expect(screen.queryByTestId("welcome-manual-email-room")).not.toBeInTheDocument();
    });

    it("holds Send until the host says which room the guest is in", async () => {
      render(<WelcomeManualEmailDialog manualId="m-1" rooms={ROOMS} onClose={onClose} />);
      await userEvent.type(
        screen.getByTestId("welcome-manual-email-input"),
        "guest@example.com",
      );
      // Valid email, but no room chosen yet.
      expect(screen.getByTestId("welcome-manual-email-send")).toBeDisabled();

      await userEvent.selectOptions(
        screen.getByTestId("welcome-manual-email-room"),
        "room-1",
      );
      expect(screen.getByTestId("welcome-manual-email-send")).not.toBeDisabled();
    });

    it("sends the chosen room id so the PDF carries that room's sections", async () => {
      emailMutationMock.mockReturnValue({
        unwrap: () => Promise.resolve(makeSend({ status: "sent" })),
      });
      render(<WelcomeManualEmailDialog manualId="m-1" rooms={ROOMS} onClose={onClose} />);
      await userEvent.type(
        screen.getByTestId("welcome-manual-email-input"),
        "guest@example.com",
      );
      await userEvent.selectOptions(
        screen.getByTestId("welcome-manual-email-room"),
        "room-1",
      );
      await userEvent.click(screen.getByTestId("welcome-manual-email-send"));

      await waitFor(() => {
        expect(emailMutationMock).toHaveBeenCalledWith({
          manualId: "m-1",
          data: {
            recipient_email: "guest@example.com",
            recipient_name: null,
            room_id: "room-1",
          },
        });
      });
    });

    it("sends a null room id for the shared-sections-only choice", async () => {
      emailMutationMock.mockReturnValue({
        unwrap: () => Promise.resolve(makeSend({ status: "sent" })),
      });
      render(<WelcomeManualEmailDialog manualId="m-1" rooms={ROOMS} onClose={onClose} />);
      await userEvent.type(
        screen.getByTestId("welcome-manual-email-input"),
        "guest@example.com",
      );
      await userEvent.selectOptions(
        screen.getByTestId("welcome-manual-email-room"),
        SHARED_ROOM_OPTION,
      );
      await userEvent.click(screen.getByTestId("welcome-manual-email-send"));

      await waitFor(() => {
        expect(emailMutationMock).toHaveBeenCalledWith({
          manualId: "m-1",
          data: {
            recipient_email: "guest@example.com",
            recipient_name: null,
            room_id: null,
          },
        });
      });
    });
  });
});
