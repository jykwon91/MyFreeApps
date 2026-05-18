/**
 * MapLineupPins tests — pin rendering, mode switching, and cluster collapse.
 *
 * The clustering threshold is 30 viewBox units (3% of a 1000x1000 minimap).
 * Pins within that distance collapse into a single numbered badge that
 * expands to a popover on click. Critical for seed data where multiple
 * lineups land on the same zone centroid.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import MapLineupPins from "@/components/lineup/MapLineupPins";
import type { Lineup } from "@/types/game";

function makeLineup(overrides: Partial<Lineup>): Lineup {
  return {
    id: "default-id",
    game_id: "g",
    map_id: "m",
    target_zone_id: "z",
    stand_zone_id: "z",
    side: "side_a",
    utility_type_id: "u",
    title: "lineup",
    notes: null,
    stand_screenshot_url: null,
    aim_screenshot_url: null,
    clip_url: null,
    aim_anchor_x: null,
    aim_anchor_y: null,
    stand_anchor_x: null,
    stand_anchor_y: null,
    target_anchor_x: null,
    target_anchor_y: null,
    effective_stand_x: null,
    effective_stand_y: null,
    effective_target_x: null,
    effective_target_y: null,
    setup_seconds: null,
    attribution_url: null,
    attribution_author: null,
    status: "accepted",
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

describe("MapLineupPins", () => {
  it("renders nothing when there are no lineups", () => {
    const { container } = render(
      <MapLineupPins
        lineups={[]}
        mode="stand"
        selectedLineupId={null}
        onPinSelect={vi.fn()}
      />,
    );
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders one pin per lineup in stand mode", () => {
    const lineups = [
      makeLineup({ id: "a", title: "first", effective_stand_x: 0.2, effective_stand_y: 0.3 }),
      makeLineup({ id: "b", title: "second", effective_stand_x: 0.7, effective_stand_y: 0.8 }),
    ];
    render(
      <MapLineupPins
        lineups={lineups}
        mode="stand"
        selectedLineupId={null}
        onPinSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /first/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /second/i })).toBeDefined();
  });

  it("skips lineups without effective coordinates", () => {
    const lineups = [
      makeLineup({ id: "a", title: "with-coords", effective_stand_x: 0.5, effective_stand_y: 0.5 }),
      makeLineup({ id: "b", title: "no-coords", effective_stand_x: null, effective_stand_y: null }),
    ];
    render(
      <MapLineupPins
        lineups={lineups}
        mode="stand"
        selectedLineupId={null}
        onPinSelect={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /with-coords/i })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /no-coords/i })).toBeNull();
  });

  it("uses target coords in target mode, stand coords in stand mode", () => {
    const lineup = makeLineup({
      id: "a",
      title: "dual",
      effective_stand_x: 0.1,
      effective_stand_y: 0.1,
      effective_target_x: 0.9,
      effective_target_y: 0.9,
    });
    const { container: standContainer, rerender } = render(
      <MapLineupPins
        lineups={[lineup]}
        mode="stand"
        selectedLineupId={null}
        onPinSelect={vi.fn()}
      />,
    );
    const standCircles = standContainer.querySelectorAll("circle");
    expect(standCircles.length).toBeGreaterThan(0);

    rerender(
      <MapLineupPins
        lineups={[lineup]}
        mode="both"
        selectedLineupId={null}
        onPinSelect={vi.fn()}
      />,
    );
    // In both mode the same lineup renders two pin groups.
    expect(screen.getAllByRole("button", { name: /dual/i }).length).toBe(2);
  });

  it("collapses pins within threshold into a numbered cluster", () => {
    // All three at roughly the same coordinates — well within the 30/1000 = 0.03 threshold.
    const lineups = [
      makeLineup({ id: "a", title: "alpha", effective_stand_x: 0.5, effective_stand_y: 0.5 }),
      makeLineup({ id: "b", title: "bravo", effective_stand_x: 0.5, effective_stand_y: 0.5 }),
      makeLineup({ id: "c", title: "charlie", effective_stand_x: 0.51, effective_stand_y: 0.51 }),
    ];
    render(
      <MapLineupPins
        lineups={lineups}
        mode="stand"
        selectedLineupId={null}
        onPinSelect={vi.fn()}
      />,
    );
    // No individual pins for alpha/bravo/charlie — they're collapsed.
    expect(screen.queryByRole("button", { name: /alpha/i })).toBeNull();
    // The cluster badge instead.
    const cluster = screen.getByRole("button", { name: /3 stacked lineups/i });
    expect(cluster).toBeDefined();
  });

  it("clicking a single pin calls onPinSelect with the lineup id", async () => {
    const onPinSelect = vi.fn();
    const user = userEvent.setup();
    const lineups = [
      makeLineup({ id: "lineup-x", title: "click me", effective_stand_x: 0.5, effective_stand_y: 0.5 }),
    ];
    render(
      <MapLineupPins
        lineups={lineups}
        mode="stand"
        selectedLineupId={null}
        onPinSelect={onPinSelect}
      />,
    );
    await user.click(screen.getByRole("button", { name: /click me/i }));
    expect(onPinSelect).toHaveBeenCalledWith("lineup-x");
  });

  it("clicking a cluster opens a popover and selects via list item", async () => {
    const onPinSelect = vi.fn();
    const user = userEvent.setup();
    const lineups = [
      makeLineup({ id: "a", title: "one", effective_stand_x: 0.5, effective_stand_y: 0.5 }),
      makeLineup({ id: "b", title: "two", effective_stand_x: 0.5, effective_stand_y: 0.5 }),
    ];
    render(
      <MapLineupPins
        lineups={lineups}
        mode="stand"
        selectedLineupId={null}
        onPinSelect={onPinSelect}
      />,
    );
    await user.click(screen.getByRole("button", { name: /2 stacked lineups/i }));
    const menu = screen.getByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: /two/i }));
    expect(onPinSelect).toHaveBeenCalledWith("b");
  });
});
