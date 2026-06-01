import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ProgressBar from "../components/ui/ProgressBar";

describe("ProgressBar", () => {
  it("exposes the progressbar role with aria values and label", () => {
    render(<ProgressBar value={57} label="57% to break-even" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "57");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuetext", "57%");
    expect(bar).toHaveAttribute("aria-label", "57% to break-even");
  });

  it("clamps values above 100", () => {
    render(<ProgressBar value={140} label="over" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("clamps negative values to 0", () => {
    render(<ProgressBar value={-20} label="under" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("applies the success fill for the success tone", () => {
    const { container } = render(<ProgressBar value={100} label="done" tone="success" />);
    const fill = container.querySelector('[role="progressbar"] > div');
    expect(fill?.className).toMatch(/bg-green-500/);
  });
});
