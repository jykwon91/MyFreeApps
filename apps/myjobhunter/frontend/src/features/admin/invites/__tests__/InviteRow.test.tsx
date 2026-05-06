/**
 * Unit tests for the two-click cancel-invite UX (PR #335).
 *
 * Covers the state machine:
 *   * idle → trash icon
 *   * first click → red "Confirm?" pill, mutation NOT fired
 *   * second click within 3s window → mutation fires, success toast
 *   * 3s timeout → reverts to trash, no side effect
 *   * blur during confirming → reverts to trash, no side effect
 *   * mutation error → error toast surfaces
 *
 * Uses ``fireEvent`` (synchronous) rather than ``userEvent`` so the
 * fake-timer interaction stays simple — userEvent v14's async pump
 * doesn't compose cleanly with vi.useFakeTimers in this test setup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

import InviteRow from "../InviteRow";
import type { Invite } from "@/types/invite/invite";

const showSuccess = vi.fn();
const showError = vi.fn();
let cancelInviteUnwrap: ReturnType<typeof vi.fn>;
let isCancelling = false;

vi.mock("lucide-react", () => ({
  Trash2: () => <span data-testid="icon-trash" />,
}));

vi.mock("@platform/ui", () => ({
  showSuccess: (...args: unknown[]) => showSuccess(...args),
  showError: (...args: unknown[]) => showError(...args),
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : "unknown error",
}));

vi.mock("@/store/invitesApi", () => ({
  useCancelInviteMutation: () => [
    vi.fn(() => ({ unwrap: cancelInviteUnwrap })),
    { isLoading: isCancelling },
  ],
}));

vi.mock("../InviteStatusBadge", () => ({
  default: ({ status }: { status: string }) => (
    <span data-testid="status-badge">{status}</span>
  ),
}));

vi.mock("../formatInviteDate", () => ({
  formatInviteDate: (s: string) => s,
}));

const SAMPLE_INVITE: Invite = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "candidate@example.com",
  status: "pending",
  expires_at: "2026-05-13T00:00:00Z",
  accepted_at: null,
  accepted_by: null,
  created_by: "22222222-2222-2222-2222-222222222222",
  created_at: "2026-05-06T00:00:00Z",
};

describe("InviteRow cancel UX", () => {
  beforeEach(() => {
    showSuccess.mockClear();
    showError.mockClear();
    cancelInviteUnwrap = vi.fn().mockResolvedValue(undefined);
    isCancelling = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the trash button in idle state", () => {
    render(<InviteRow invite={SAMPLE_INVITE} />);

    expect(screen.getByTestId("icon-trash")).toBeInTheDocument();
    expect(screen.queryByText(/confirm\?/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/cancel invite for/i)).toBeInTheDocument();
  });

  it("first click swaps to a Confirm? pill without firing the mutation", () => {
    render(<InviteRow invite={SAMPLE_INVITE} />);

    fireEvent.click(screen.getByLabelText(/cancel invite for/i));

    expect(screen.getByText(/confirm\?/i)).toBeInTheDocument();
    expect(cancelInviteUnwrap).not.toHaveBeenCalled();
    expect(showSuccess).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/confirm cancellation/i)).toBeInTheDocument();
  });

  it("second click within the 3s window fires the cancellation", async () => {
    render(<InviteRow invite={SAMPLE_INVITE} />);

    fireEvent.click(screen.getByLabelText(/cancel invite for/i));
    fireEvent.click(screen.getByLabelText(/confirm cancellation/i));

    await waitFor(() => {
      expect(cancelInviteUnwrap).toHaveBeenCalledTimes(1);
    });
    expect(showSuccess).toHaveBeenCalledWith("Invite cancelled");
  });

  it("auto-reverts to idle after 3 seconds with no side effect", () => {
    vi.useFakeTimers();
    render(<InviteRow invite={SAMPLE_INVITE} />);

    fireEvent.click(screen.getByLabelText(/cancel invite for/i));
    expect(screen.getByText(/confirm\?/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3100);
    });

    expect(screen.queryByText(/confirm\?/i)).not.toBeInTheDocument();
    expect(cancelInviteUnwrap).not.toHaveBeenCalled();
  });

  it("aborts the pending confirmation on blur", () => {
    render(<InviteRow invite={SAMPLE_INVITE} />);

    fireEvent.click(screen.getByLabelText(/cancel invite for/i));
    expect(screen.getByText(/confirm\?/i)).toBeInTheDocument();

    fireEvent.blur(screen.getByLabelText(/confirm cancellation/i));

    expect(screen.queryByText(/confirm\?/i)).not.toBeInTheDocument();
    expect(cancelInviteUnwrap).not.toHaveBeenCalled();
  });

  it("surfaces an error toast when the mutation rejects", async () => {
    cancelInviteUnwrap = vi.fn().mockRejectedValue(new Error("backend exploded"));
    render(<InviteRow invite={SAMPLE_INVITE} />);

    fireEvent.click(screen.getByLabelText(/cancel invite for/i));
    fireEvent.click(screen.getByLabelText(/confirm cancellation/i));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledTimes(1);
    });
    expect(showError.mock.calls[0]?.[0]).toMatch(/backend exploded/);
    expect(showSuccess).not.toHaveBeenCalled();
  });
});
