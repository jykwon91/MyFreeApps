/**
 * A move to another suggestion and an answer share one busy state: while either is on its way, the other can't be
 * pressed, so the card never sends both. A failed move toasts like any other action on the card.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { showError } from "@platform/ui";
import { RATE_LIMITED_MESSAGES } from "@myjobhunter/api-client/constants/rateLimitedMessages";
import { NavDirection } from "@myjobhunter/api-client/types/resume-refinement/nav-direction";
import { unsureRepeatableMessage } from "@platform/core/utils/unsureRepeatableMessage";
import PendingProposalCard from "../PendingProposalCard";
import { makeRefinementSession } from "./makeRefinementSession";
import { makeTarget } from "./makeTarget";

const navigate = vi.fn();
const busy = { navigating: false, accepting: false };
const idleMutation = () => [vi.fn(), { isLoading: false }];

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("@myjobhunter/api-client/store/resumeRefinementApi", () => ({
  useAcceptPendingMutation: () => [vi.fn(), { isLoading: busy.accepting }],
  useAcceptFlaggedMutation: () => idleMutation(),
  useSupplyCustomRewriteMutation: () => idleMutation(),
  useRequestAlternativeMutation: () => idleMutation(),
  useSkipTargetMutation: () => idleMutation(),
  useNavigateRefinementMutation: () => [navigate, { isLoading: busy.navigating }],
}));

const session = () =>
  makeRefinementSession({ target_index: 1, improvement_targets: [makeTarget("Led the team"), makeTarget("Shipped the app"), makeTarget("Wrote docs")] });

describe("PendingProposalCard moving between suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    busy.navigating = false;
    busy.accepting = false;
  });

  it("can't be answered while a move is on its way", () => {
    busy.navigating = true;
    render(<PendingProposalCard session={session()} />);

    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Write my own/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Skip/ })).toBeDisabled();
    expect(screen.getByLabelText(/next suggestion/i)).toBeDisabled();
  });

  it("can't move while an answer is on its way", () => {
    busy.accepting = true;
    render(<PendingProposalCard session={session()} />);

    expect(screen.getByLabelText(/previous suggestion/i)).toBeDisabled();
    expect(screen.getByLabelText(/next suggestion/i)).toBeDisabled();
  });

  it("moves the session in the direction clicked", async () => {
    navigate.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    render(<PendingProposalCard session={session()} />);

    fireEvent.click(screen.getByLabelText(/next suggestion/i));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ id: "session-1", direction: NavDirection.NEXT }));
    expect(showError).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 429, data: { detail: "Too many attempts" } }, RATE_LIMITED_MESSAGES.resumeRefinement],
    [{ status: "FETCH_ERROR", error: "TypeError: Failed to fetch" }, unsureRepeatableMessage("that went through")],
  ])("toasts a failed move (%j)", async (error, message) => {
    navigate.mockReturnValue({ unwrap: () => Promise.reject(error) });
    render(<PendingProposalCard session={session()} />);

    fireEvent.click(screen.getByLabelText(/next suggestion/i));
    await waitFor(() => expect(showError).toHaveBeenCalledWith(message));
  });
});
