/** A 429 on the card's turn-limited actions: the refinement message in the toast, and the typed text kept. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { showError } from "@platform/ui";
import { RATE_LIMITED_MESSAGES } from "@myjobhunter/api-client/constants/rateLimitedMessages";
import PendingProposalCard from "../PendingProposalCard";
import { makeRefinementSession } from "./makeRefinementSession";

const acceptPending = vi.fn();
const requestAlternative = vi.fn();
const idleMutation = () => [vi.fn(), { isLoading: false }];
const limited = () => ({ unwrap: () => Promise.reject({ status: 429, data: { detail: "Too many attempts" } }) });

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("@myjobhunter/api-client/store/resumeRefinementApi", () => ({
  useAcceptPendingMutation: () => [acceptPending, { isLoading: false }],
  useAcceptFlaggedMutation: () => idleMutation(),
  useSupplyCustomRewriteMutation: () => idleMutation(),
  useRequestAlternativeMutation: () => [requestAlternative, { isLoading: false }],
  useSkipTargetMutation: () => idleMutation(),
}));

vi.mock("@/features/resume_refinement/NavigationButtons", () => ({ default: () => null }));

describe("PendingProposalCard rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acceptPending.mockImplementation(limited);
    requestAlternative.mockImplementation(limited);
  });

  it("toasts the refinement message when Accept is limited, and Accept can be pressed again", async () => {
    render(<PendingProposalCard session={makeRefinementSession()} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith(RATE_LIMITED_MESSAGES.resumeRefinement));

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(acceptPending).toHaveBeenCalledTimes(2));
  });

  it("toasts the refinement message when a composer send is limited, and brings the typed text back", async () => {
    render(<PendingProposalCard session={makeRefinementSession()} />);
    const composer = screen.getByLabelText("Message the assistant");
    fireEvent.change(composer, { target: { value: "no em dashes" } });
    fireEvent.keyDown(composer, { key: "Enter" });

    await waitFor(() => expect(showError).toHaveBeenCalledWith(RATE_LIMITED_MESSAGES.resumeRefinement));
    expect(screen.getByLabelText("Message the assistant")).toHaveValue("no em dashes");
  });
});
