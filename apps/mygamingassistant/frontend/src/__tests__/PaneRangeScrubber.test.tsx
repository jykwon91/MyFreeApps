/**
 * PaneRangeScrubber unit tests — PR2 two-thumb range primitive.
 *
 * Pure component, no hooks-with-side-effects to mock. Pointer events are
 * exercised indirectly via the keyboard surface — fully wiring jsdom
 * pointer-capture + bounding-rect math adds little signal beyond the
 * keyboard tests for the same clamping rules.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import PaneRangeScrubber from "@/components/lineup/PaneRangeScrubber";

describe("PaneRangeScrubber", () => {
  it("renders two thumbs as role=slider with aria-valuemin/max/now reflecting props", () => {
    render(
      <PaneRangeScrubber
        max={10}
        startValue={2}
        endValue={8}
        minWindow={1}
        onChange={vi.fn()}
      />,
    );
    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(2);
    expect(sliders[0]).toHaveAttribute("aria-valuemin", "0");
    expect(sliders[0]).toHaveAttribute("aria-valuemax", "10");
    expect(sliders[0]).toHaveAttribute("aria-valuenow", "2");
    expect(sliders[1]).toHaveAttribute("aria-valuemin", "0");
    expect(sliders[1]).toHaveAttribute("aria-valuemax", "10");
    expect(sliders[1]).toHaveAttribute("aria-valuenow", "8");
  });

  it("ArrowRight nudges the start thumb by `step`", () => {
    const onChange = vi.fn();
    render(
      <PaneRangeScrubber
        max={10}
        startValue={2}
        endValue={8}
        minWindow={1}
        step={0.5}
        onChange={onChange}
      />,
    );
    const [startThumb] = screen.getAllByRole("slider");
    fireEvent.keyDown(startThumb, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(2.5, 8);
  });

  it("Shift+ArrowRight accelerates the start thumb by 5×step", () => {
    const onChange = vi.fn();
    render(
      <PaneRangeScrubber
        max={10}
        startValue={2}
        endValue={8}
        minWindow={1}
        step={0.5}
        onChange={onChange}
      />,
    );
    const [startThumb] = screen.getAllByRole("slider");
    fireEvent.keyDown(startThumb, { key: "ArrowRight", shiftKey: true });
    expect(onChange).toHaveBeenCalledWith(4.5, 8);
  });

  it("ArrowLeft nudges the end thumb by `step`", () => {
    const onChange = vi.fn();
    render(
      <PaneRangeScrubber
        max={10}
        startValue={2}
        endValue={5}
        minWindow={1}
        step={0.5}
        onChange={onChange}
      />,
    );
    const [, endThumb] = screen.getAllByRole("slider");
    fireEvent.keyDown(endThumb, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(2, 4.5);
  });

  it("Shift+ArrowRight on the end thumb is clamped to max", () => {
    const onChange = vi.fn();
    render(
      <PaneRangeScrubber
        max={10}
        startValue={2}
        endValue={9}
        minWindow={1}
        step={0.5}
        onChange={onChange}
      />,
    );
    const [, endThumb] = screen.getAllByRole("slider");
    // 9 + 5*0.5 = 11.5 → clamp to max=10
    fireEvent.keyDown(endThumb, { key: "ArrowRight", shiftKey: true });
    expect(onChange).toHaveBeenCalledWith(2, 10);
  });

  it("start thumb cannot advance past endValue - minWindow", () => {
    const onChange = vi.fn();
    render(
      <PaneRangeScrubber
        max={10}
        startValue={6.5}
        endValue={7}
        minWindow={0.5}
        step={1}
        onChange={onChange}
      />,
    );
    const [startThumb] = screen.getAllByRole("slider");
    // 6.5 + 1 = 7.5 → clamp to (endValue - minWindow) = 6.5 → no change
    fireEvent.keyDown(startThumb, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(6.5, 7);
  });

  it("end thumb cannot retreat past startValue + minWindow", () => {
    const onChange = vi.fn();
    render(
      <PaneRangeScrubber
        max={10}
        startValue={2}
        endValue={2.5}
        minWindow={0.5}
        step={1}
        onChange={onChange}
      />,
    );
    const [, endThumb] = screen.getAllByRole("slider");
    // 2.5 - 1 = 1.5 → clamp to (startValue + minWindow) = 2.5 → no change
    fireEvent.keyDown(endThumb, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(2, 2.5);
  });

  it("Home on the start thumb snaps to 0", () => {
    const onChange = vi.fn();
    render(
      <PaneRangeScrubber
        max={10}
        startValue={5}
        endValue={8}
        minWindow={1}
        onChange={onChange}
      />,
    );
    const [startThumb] = screen.getAllByRole("slider");
    fireEvent.keyDown(startThumb, { key: "Home" });
    expect(onChange).toHaveBeenCalledWith(0, 8);
  });

  it("End on the end thumb snaps to max", () => {
    const onChange = vi.fn();
    render(
      <PaneRangeScrubber
        max={10}
        startValue={2}
        endValue={5}
        minWindow={1}
        onChange={onChange}
      />,
    );
    const [, endThumb] = screen.getAllByRole("slider");
    fireEvent.keyDown(endThumb, { key: "End" });
    expect(onChange).toHaveBeenCalledWith(2, 10);
  });

  it("disabled thumbs do not fire onChange on keyboard input", () => {
    const onChange = vi.fn();
    render(
      <PaneRangeScrubber
        max={10}
        startValue={2}
        endValue={5}
        minWindow={1}
        onChange={onChange}
        disabled
      />,
    );
    const [startThumb, endThumb] = screen.getAllByRole("slider");
    fireEvent.keyDown(startThumb, { key: "ArrowRight" });
    fireEvent.keyDown(endThumb, { key: "ArrowLeft" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
