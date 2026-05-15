/**
 * MinimapPinEditor unit tests.
 *
 * Tests:
 * - Renders both pins from effective coords when fields are empty strings
 * - Dashed ring present when field is empty + explicit anchor is null (guess)
 * - Dashed ring absent when field has a value (operator explicitly set it)
 * - Reset stand button: enabled when standAnchorX is non-empty, calls onResetStand
 * - Reset target button: enabled when targetAnchorX is non-empty, calls onResetTarget
 * - Reset buttons disabled when fields are empty
 * - No-image fallback still renders SVG pins
 * - Keyboard arrow nudges call onChange with updated normalized coords
 * - Shift+Arrow moves by 5% (50 viewBox units)
 * - Escape blurs the focused pin element
 * - Both pins are disabled (pointer-events:none, tabIndex=-1) when disabled=true
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import MinimapPinEditor from "@/components/review/MinimapPinEditor";
import type { Lineup } from "@/types/game";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeLineup(overrides: Partial<Lineup> = {}): Lineup {
  return {
    id: "lineup-1",
    game_id: "game-1",
    map_id: "map-1",
    target_zone_id: "zone-1",
    stand_zone_id: "zone-2",
    side: "side_a",
    utility_type_id: "util-1",
    title: "Test Lineup",
    notes: null,
    stand_screenshot_url: null,
    aim_screenshot_url: null,
    aim_anchor_x: null,
    aim_anchor_y: null,
    stand_anchor_x: null,
    stand_anchor_y: null,
    target_anchor_x: null,
    target_anchor_y: null,
    effective_stand_x: 0.3,
    effective_stand_y: 0.4,
    effective_target_x: 0.7,
    effective_target_y: 0.8,
    setup_seconds: null,
    attribution_url: null,
    attribution_author: null,
    status: "pending_review",
    youtube_video_id: null,
    chapter_start_seconds: null,
    chapter_title: null,
    suggested_game_id: null,
    suggested_map_id: null,
    suggested_target_zone_id: null,
    suggested_stand_zone_id: null,
    suggested_side: null,
    suggested_utility_type_id: null,
    classification_confidence: null,
    classification_reasoning: null,
    target_zone: null,
    stand_zone: null,
    utility_type: null,
    ...overrides,
  };
}

const DEFAULT_PROPS = {
  minimapUrl: "https://example.com/minimap.png",
  standAnchorX: "",
  standAnchorY: "",
  targetAnchorX: "",
  targetAnchorY: "",
  onStandChange: vi.fn(),
  onTargetChange: vi.fn(),
  onResetStand: vi.fn(),
  onResetTarget: vi.fn(),
  disabled: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MinimapPinEditor", () => {
  it("renders the SVG overlay", () => {
    const lineup = makeLineup();
    const { container } = render(
      <MinimapPinEditor lineup={lineup} {...DEFAULT_PROPS} />,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("renders two pin groups (Stand and Target) via aria roles", () => {
    const lineup = makeLineup();
    render(<MinimapPinEditor lineup={lineup} {...DEFAULT_PROPS} />);
    const standPin = screen.getByRole("slider", { name: /stand pin/i });
    const targetPin = screen.getByRole("slider", { name: /target pin/i });
    expect(standPin).toBeDefined();
    expect(targetPin).toBeDefined();
  });

  it("aria-valuetext reflects effective coords when fields are empty", () => {
    const lineup = makeLineup({
      effective_stand_x: 0.3,
      effective_stand_y: 0.4,
      effective_target_x: 0.7,
      effective_target_y: 0.8,
    });
    render(<MinimapPinEditor lineup={lineup} {...DEFAULT_PROPS} />);
    const standPin = screen.getByRole("slider", { name: /stand pin/i });
    expect(standPin.getAttribute("aria-valuetext")).toContain("0.30");
  });

  it("shows dashed ring circles when both field is empty and explicit anchor is null (guess)", () => {
    const lineup = makeLineup({
      stand_anchor_x: null,
      target_anchor_x: null,
      effective_stand_x: 0.3,
      effective_stand_y: 0.4,
    });
    const { container } = render(
      <MinimapPinEditor
        lineup={lineup}
        {...DEFAULT_PROPS}
        standAnchorX=""
        standAnchorY=""
        targetAnchorX=""
        targetAnchorY=""
      />,
    );
    // Dashed rings have stroke-dasharray attribute
    const dashedCircles = Array.from(container.querySelectorAll("circle")).filter(
      (el) => el.getAttribute("stroke-dasharray") !== null,
    );
    expect(dashedCircles.length).toBe(2); // one for stand, one for target
  });

  it("does not show dashed ring when field has a value (explicitly set by operator)", () => {
    const lineup = makeLineup({
      stand_anchor_x: null, // explicit anchor null but field is set — no longer a guess
    });
    const { container } = render(
      <MinimapPinEditor
        lineup={lineup}
        {...DEFAULT_PROPS}
        standAnchorX="0.25"
        standAnchorY="0.35"
        targetAnchorX=""
        targetAnchorY=""
      />,
    );
    const dashedCircles = Array.from(container.querySelectorAll("circle")).filter(
      (el) => el.getAttribute("stroke-dasharray") !== null,
    );
    // Only the target pin should show a dashed ring (stand was explicitly set)
    expect(dashedCircles.length).toBe(1);
  });

  it("does not show dashed ring when lineup has an explicit anchor (stand_anchor_x set)", () => {
    const lineup = makeLineup({
      stand_anchor_x: 0.3,
      stand_anchor_y: 0.4,
    });
    const { container } = render(
      <MinimapPinEditor
        lineup={lineup}
        {...DEFAULT_PROPS}
        standAnchorX="" // field string empty but explicit anchor exists → not a guess
        standAnchorY=""
        targetAnchorX=""
        targetAnchorY=""
      />,
    );
    const dashedCircles = Array.from(container.querySelectorAll("circle")).filter(
      (el) => el.getAttribute("stroke-dasharray") !== null,
    );
    // Only target should have dashed ring
    expect(dashedCircles.length).toBe(1);
  });

  it("reset stand button is disabled when standAnchorX is empty", () => {
    const lineup = makeLineup();
    render(
      <MinimapPinEditor
        lineup={lineup}
        {...DEFAULT_PROPS}
        standAnchorX=""
        standAnchorY=""
      />,
    );
    const resetStand = screen.getByRole("button", { name: /reset stand/i });
    expect(resetStand).toBeDisabled();
  });

  it("reset stand button is enabled when standAnchorX has a value", () => {
    const lineup = makeLineup();
    render(
      <MinimapPinEditor
        lineup={lineup}
        {...DEFAULT_PROPS}
        standAnchorX="0.25"
        standAnchorY="0.35"
      />,
    );
    const resetStand = screen.getByRole("button", { name: /reset stand/i });
    expect(resetStand).not.toBeDisabled();
  });

  it("reset stand button calls onResetStand when clicked", async () => {
    const onResetStand = vi.fn();
    const user = userEvent.setup();
    const lineup = makeLineup();
    render(
      <MinimapPinEditor
        lineup={lineup}
        {...DEFAULT_PROPS}
        standAnchorX="0.25"
        standAnchorY="0.35"
        onResetStand={onResetStand}
      />,
    );
    await user.click(screen.getByRole("button", { name: /reset stand/i }));
    expect(onResetStand).toHaveBeenCalledTimes(1);
  });

  it("reset target button is disabled when targetAnchorX is empty", () => {
    const lineup = makeLineup();
    render(
      <MinimapPinEditor
        lineup={lineup}
        {...DEFAULT_PROPS}
        targetAnchorX=""
        targetAnchorY=""
      />,
    );
    const resetTarget = screen.getByRole("button", { name: /reset target/i });
    expect(resetTarget).toBeDisabled();
  });

  it("reset target button calls onResetTarget when clicked", async () => {
    const onResetTarget = vi.fn();
    const user = userEvent.setup();
    const lineup = makeLineup();
    render(
      <MinimapPinEditor
        lineup={lineup}
        {...DEFAULT_PROPS}
        targetAnchorX="0.6"
        targetAnchorY="0.7"
        onResetTarget={onResetTarget}
      />,
    );
    await user.click(screen.getByRole("button", { name: /reset target/i }));
    expect(onResetTarget).toHaveBeenCalledTimes(1);
  });

  it("renders 'No minimap image' when minimapUrl is null but still renders pins", () => {
    const lineup = makeLineup();
    render(
      <MinimapPinEditor
        lineup={lineup}
        {...DEFAULT_PROPS}
        minimapUrl={null}
      />,
    );
    expect(screen.getByText("No minimap image")).toBeDefined();
    // SVG pins still render
    expect(screen.getByRole("slider", { name: /stand pin/i })).toBeDefined();
    expect(screen.getByRole("slider", { name: /target pin/i })).toBeDefined();
  });

  it("still renders pins after the minimap image load fails", async () => {
    const lineup = makeLineup();
    const { container } = render(
      <MinimapPinEditor lineup={lineup} {...DEFAULT_PROPS} />,
    );
    // Simulate image load failure — wrap in act() because it triggers state update.
    const img = container.querySelector("img");
    if (img) {
      await act(async () => {
        img.dispatchEvent(new Event("error"));
      });
    }
    // SVG still present even after image failure
    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("slider", { name: /stand pin/i })).toBeDefined();
  });

  it("stand pin arrow key nudges call onStandChange with updated coords (1% step)", async () => {
    const onStandChange = vi.fn();
    const user = userEvent.setup();
    const lineup = makeLineup({
      effective_stand_x: 0.5,
      effective_stand_y: 0.5,
    });
    render(
      <MinimapPinEditor
        lineup={lineup}
        {...DEFAULT_PROPS}
        standAnchorX="0.5"
        standAnchorY="0.5"
        onStandChange={onStandChange}
      />,
    );
    const standPin = screen.getByRole("slider", { name: /stand pin/i });
    standPin.focus();
    await user.keyboard("{ArrowRight}");
    expect(onStandChange).toHaveBeenCalledTimes(1);
    const [newX] = onStandChange.mock.calls[0] as [number, number];
    // 0.5 + 10/1000 = 0.51
    expect(newX).toBeCloseTo(0.51, 4);
  });

  it("stand pin Shift+ArrowRight moves by 5% (50 viewBox units)", async () => {
    const onStandChange = vi.fn();
    const user = userEvent.setup();
    const lineup = makeLineup({
      effective_stand_x: 0.5,
      effective_stand_y: 0.5,
    });
    render(
      <MinimapPinEditor
        lineup={lineup}
        {...DEFAULT_PROPS}
        standAnchorX="0.5"
        standAnchorY="0.5"
        onStandChange={onStandChange}
      />,
    );
    const standPin = screen.getByRole("slider", { name: /stand pin/i });
    standPin.focus();
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(onStandChange).toHaveBeenCalledTimes(1);
    const [newX] = onStandChange.mock.calls[0] as [number, number];
    // 0.5 + 50/1000 = 0.55
    expect(newX).toBeCloseTo(0.55, 4);
  });

  it("arrow key clamps to [0, 1] at the boundary", async () => {
    const onStandChange = vi.fn();
    const user = userEvent.setup();
    const lineup = makeLineup({
      effective_stand_x: 0.0,
      effective_stand_y: 0.5,
    });
    render(
      <MinimapPinEditor
        lineup={lineup}
        {...DEFAULT_PROPS}
        standAnchorX="0.0"
        standAnchorY="0.5"
        onStandChange={onStandChange}
      />,
    );
    const standPin = screen.getByRole("slider", { name: /stand pin/i });
    standPin.focus();
    await user.keyboard("{ArrowLeft}");
    const [newX] = onStandChange.mock.calls[0] as [number, number];
    expect(newX).toBe(0); // clamped
  });

  it("pins are not interactive when disabled=true", () => {
    const lineup = makeLineup();
    render(
      <MinimapPinEditor
        lineup={lineup}
        {...DEFAULT_PROPS}
        disabled={true}
      />,
    );
    const standPin = screen.getByRole("slider", { name: /stand pin/i });
    // When disabled, tabIndex is -1
    expect(standPin.getAttribute("tabindex")).toBe("-1");
  });

  it("reset buttons are disabled when disabled=true even if field is set", () => {
    const lineup = makeLineup();
    render(
      <MinimapPinEditor
        lineup={lineup}
        {...DEFAULT_PROPS}
        standAnchorX="0.3"
        standAnchorY="0.4"
        targetAnchorX="0.6"
        targetAnchorY="0.7"
        disabled={true}
      />,
    );
    expect(screen.getByRole("button", { name: /reset stand/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /reset target/i })).toBeDisabled();
  });
});
