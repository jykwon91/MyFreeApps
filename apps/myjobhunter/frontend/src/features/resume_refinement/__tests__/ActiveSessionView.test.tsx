import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import ActiveSessionView from "../ActiveSessionView";
import { makeRefinementSession } from "./makeRefinementSession";
import { makeTarget } from "./makeTarget";

const createTargetFromLine = vi.fn(() => ({ unwrap: () => Promise.resolve() }));

vi.mock("@/lib/resumeRefinementApi", () => ({
  useCreateTargetFromLineMutation: () => [createTargetFromLine, { isLoading: false }],
}));

vi.mock("@/features/resume_refinement/CurrentDraftPanel", () => ({
  default: ({
    highlightText,
    onLineClick,
  }: {
    highlightText: string | null;
    onLineClick?: (line: { text: string; section: string }) => void;
  }) => (
    <div>
      <p data-testid="highlight">{highlightText}</p>
      <button onClick={() => onLineClick?.({ text: "Shipped the app", section: "Experience" })}>
        pick line
      </button>
    </div>
  ),
}));

vi.mock("@/features/resume_refinement/ActiveSessionLayout", () => ({
  default: ({ draft }: { draft: ReactNode }) => <div>{draft}</div>,
}));

describe("ActiveSessionView click-to-target", () => {
  it("highlights the clicked line at once, then follows the session's target", async () => {
    const targets = [makeTarget("Led the team"), makeTarget("Shipped the app"), makeTarget("Cut costs")];
    const { rerender } = render(
      <ActiveSessionView
        session={makeRefinementSession({ improvement_targets: targets, target_index: 0 })}
        onStartNew={vi.fn()}
      />,
    );
    expect(screen.getByTestId("highlight")).toHaveTextContent("Led the team");

    await act(async () => {
      fireEvent.click(screen.getByText("pick line"));
    });
    expect(screen.getByTestId("highlight")).toHaveTextContent("Shipped the app");

    // The refetched session now targets the clicked line: the override is done.
    rerender(
      <ActiveSessionView
        session={makeRefinementSession({ improvement_targets: targets, target_index: 1 })}
        onStartNew={vi.fn()}
      />,
    );
    expect(screen.getByTestId("highlight")).toHaveTextContent("Shipped the app");

    // Moving on must show the next target, not the old clicked line.
    rerender(
      <ActiveSessionView
        session={makeRefinementSession({ improvement_targets: targets, target_index: 2 })}
        onStartNew={vi.fn()}
      />,
    );
    expect(screen.getByTestId("highlight")).toHaveTextContent("Cut costs");
  });
});
