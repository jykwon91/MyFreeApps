/**
 * NavigationButtons: Prev / Next, disabled at the session's ends and while anything on the session is on its way
 * (the card's shared busy state, a move included). The move itself lives in useRefinementProposal; see
 * PendingProposalCard.navigation.test.tsx for a move and an answer together.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NavigationButtons from "../NavigationButtons";
import { NavDirection } from "@myjobhunter/api-client/types/resume-refinement/nav-direction";

function renderAt(targetIndex: number, isPending = false) {
  const onMove = vi.fn();
  render(<NavigationButtons targetIndex={targetIndex} totalTargets={5} isPending={isPending} onMove={onMove} />);
  return {
    onMove,
    prev: screen.getByLabelText(/previous suggestion/i) as HTMLButtonElement,
    next: screen.getByLabelText(/next suggestion/i) as HTMLButtonElement,
  };
}

describe("NavigationButtons", () => {
  it("disables Prev at the first target, leaves Next enabled", () => {
    const { prev, next } = renderAt(0);
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
  });

  it("disables Next at the last target, leaves Prev enabled", () => {
    const { prev, next } = renderAt(4);
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(true);
  });

  it("enables both buttons in the middle of the session", () => {
    const { prev, next } = renderAt(2);
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(false);
  });

  it("disables both while anything on the session is on its way", () => {
    const { prev, next } = renderAt(2, true);
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(true);
  });

  it("moves in the direction clicked", () => {
    const { onMove, prev, next } = renderAt(2);
    fireEvent.click(next);
    fireEvent.click(prev);
    expect(onMove.mock.calls).toEqual([[NavDirection.NEXT], [NavDirection.PREV]]);
  });
});
