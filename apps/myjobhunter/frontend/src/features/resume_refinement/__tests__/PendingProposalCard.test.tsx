import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PendingProposalCard from "../PendingProposalCard";
import { makeRefinementSession } from "./makeRefinementSession";

const requestAlternative = vi.fn(() => ({ unwrap: () => new Promise(() => {}) }));
const idleMutation = () => [vi.fn(), { isLoading: false }];

vi.mock("@myjobhunter/api-client/store/resumeRefinementApi", () => ({
  useAcceptPendingMutation: () => idleMutation(),
  useAcceptFlaggedMutation: () => idleMutation(),
  useSupplyCustomRewriteMutation: () => idleMutation(),
  useRequestAlternativeMutation: () => [requestAlternative, { isLoading: false }],
  useSkipTargetMutation: () => idleMutation(),
}));

vi.mock("@/features/resume_refinement/NavigationButtons", () => ({
  default: () => null,
}));

describe("PendingProposalCard optimistic echo", () => {
  it("shows the sent message until the real turn arrives, then clears it", () => {
    const onEcho = vi.fn();
    const session = makeRefinementSession({ turn_count: 2 });
    const { rerender } = render(
      <PendingProposalCard session={session} onPendingEchoChange={onEcho} />,
    );

    const composer = screen.getByLabelText("Message the assistant");
    fireEvent.change(composer, { target: { value: "no em dashes" } });
    fireEvent.keyDown(composer, { key: "Enter" });

    expect(requestAlternative).toHaveBeenCalledWith({ id: "session-1", hint: "no em dashes" });
    expect(onEcho).toHaveBeenLastCalledWith({ text: "no em dashes" });

    rerender(
      <PendingProposalCard
        session={makeRefinementSession({ turn_count: 2, updated_at: "2026-01-01T00:00:01Z" })}
        onPendingEchoChange={onEcho}
      />,
    );
    expect(onEcho).toHaveBeenLastCalledWith({ text: "no em dashes" });

    rerender(
      <PendingProposalCard
        session={makeRefinementSession({ turn_count: 3 })}
        onPendingEchoChange={onEcho}
      />,
    );
    expect(onEcho).toHaveBeenLastCalledWith(null);
  });
});
