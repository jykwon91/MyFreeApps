/** A session that couldn't load can be retried; only a gone session offers just a new one. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import SessionLoadErrorView from "../SessionLoadErrorView";

vi.mock("@/features/resume_refinement/ResumeRefinementHeader", () => ({ default: () => null }));

function renderView(isGone: boolean) {
  const onRetry = vi.fn();
  const onStartNew = vi.fn();
  render(<SessionLoadErrorView isGone={isGone} isRetrying={false} onRetry={onRetry} onStartNew={onStartNew} />);
  return { onRetry, onStartNew };
}

describe("SessionLoadErrorView", () => {
  it("offers Try again first for a failed load, keeping the saved session", () => {
    const { onRetry, onStartNew } = renderView(false);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Try again", "Start a new one"]);
    fireEvent.click(buttons[0]);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onStartNew).not.toHaveBeenCalled();
  });

  it("offers only Start a new one when the session no longer exists", () => {
    const { onStartNew } = renderView(true);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start a new one" }));
    expect(onStartNew).toHaveBeenCalledTimes(1);
  });
});
