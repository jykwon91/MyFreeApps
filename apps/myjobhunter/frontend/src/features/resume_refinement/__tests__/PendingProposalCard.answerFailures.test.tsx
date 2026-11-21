/**
 * How the card words a failed answer: a suggestion that had already moved on is named as such (the server's own 409
 * never reads as a bare failure), and a lost reply says what the phone says, that it may have gone through and trying
 * again is safe.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { showError } from "@platform/ui";
import { REFINEMENT_CONFLICT_CODES } from "@myjobhunter/api-client/constants/refinementConflictCodes";
import { REFINEMENT_FAILURES } from "@myjobhunter/api-client/constants/refinementFailures";
import { unsureRepeatableMessage } from "@platform/core/utils/unsureRepeatableMessage";
import PendingProposalCard from "../PendingProposalCard";
import { makeRefinementSession } from "./makeRefinementSession";

const acceptPending = vi.fn();
const skipTarget = vi.fn();
const idleMutation = () => [vi.fn(), { isLoading: false }];
const rejectingWith = (error: unknown) => () => ({ unwrap: () => Promise.reject(error) });
const changed = rejectingWith({
  status: 409,
  data: { detail: { code: REFINEMENT_CONFLICT_CODES.suggestionChanged, message: "server words" } },
});

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("@myjobhunter/api-client/store/resumeRefinementApi", () => ({
  useAcceptPendingMutation: () => [acceptPending, { isLoading: false }],
  useAcceptFlaggedMutation: () => idleMutation(),
  useSupplyCustomRewriteMutation: () => idleMutation(),
  useRequestAlternativeMutation: () => idleMutation(),
  useSkipTargetMutation: () => [skipTarget, { isLoading: false }],
  useNavigateRefinementMutation: () => idleMutation(),
}));

vi.mock("@/features/resume_refinement/NavigationButtons", () => ({ default: () => null }));

describe("PendingProposalCard when the suggestion had moved on", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acceptPending.mockImplementation(changed);
    skipTarget.mockImplementation(changed);
  });

  it.each([
    ["Accept", acceptPending],
    ["Skip", skipTarget],
  ])("%s names the suggestion on screen and says it had moved on", async (button, trigger) => {
    const session = makeRefinementSession({ target_index: 1, turn_count: 5 });
    render(<PendingProposalCard session={session} />);
    fireEvent.click(screen.getByRole("button", { name: button }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(REFINEMENT_FAILURES.suggestionChanged));
    expect(trigger).toHaveBeenCalledWith({ id: session.id, seen_target_index: 1, seen_turn_count: 5 });
  });
});

describe("PendingProposalCard when the reply to an answer was lost", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["Accept", acceptPending, { status: "FETCH_ERROR", error: "TypeError: Failed to fetch" }],
    ["Skip", skipTarget, { status: "TIMEOUT_ERROR", error: "timed out" }],
    ["Accept", acceptPending, { status: 502, data: "<html>Bad Gateway</html>" }],
  ])("%s says it may have gone through and that trying again is safe (%j)", async (button, trigger, error) => {
    trigger.mockImplementation(rejectingWith(error));
    render(<PendingProposalCard session={makeRefinementSession({ target_index: 1, turn_count: 5 })} />);
    fireEvent.click(screen.getByRole("button", { name: button }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(unsureRepeatableMessage("that went through")));
    expect(showError).toHaveBeenCalledTimes(1);
  });

  it("says nothing when signing out called the answer off", async () => {
    acceptPending.mockImplementation(rejectingWith({ name: "AbortError", message: "Aborted" }));
    render(<PendingProposalCard session={makeRefinementSession()} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => expect(acceptPending).toHaveBeenCalled());
    await Promise.resolve();
    expect(showError).not.toHaveBeenCalled();
  });
});
