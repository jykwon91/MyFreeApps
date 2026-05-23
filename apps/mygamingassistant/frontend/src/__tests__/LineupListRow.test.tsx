/**
 * LineupListRow unit tests — compact-list-row primitive.
 *
 * Stub IntersectionObserver + HTMLMediaElement methods because the expanded
 * state mounts GlanceBoardTile (which contains ClipView <video> elements).
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LineupListRow from "@/components/lineup/LineupListRow";
import type { Lineup, Game } from "@/types/game";

function makeLineup(over: Partial<Lineup> = {}): Lineup {
  return {
    id: "l1",
    game_id: "g1",
    map_id: "m1",
    target_zone_id: "z1",
    stand_zone_id: "z2",
    side: "side_a",
    utility_type_id: "u1",
    title: "B Site smoke from T Spawn",
    notes: null,
    stand_screenshot_url: null,
    aim_screenshot_url: null,
    clip_url: null,
    landing_clip_url: null,
    stand_clip_url: null,
    aim_clip_url: null,
    stand_clip_offset_s: null,
    aim_clip_offset_s: null,
    clip_url_original: null,
    clip_trim_start_s: null,
    clip_trim_end_s: null,
    clip_source_start_in_video_s: null,
    landing_clip_url_original: null,
    landing_clip_trim_start_s: null,
    landing_clip_trim_end_s: null,
    landing_clip_source_start_in_video_s: null,
    technique: null,
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
    setup_seconds: 7,
    attribution_url: null,
    attribution_author: null,
    status: "accepted",
    youtube_video_id: "vid1",
    chapter_start_seconds: 12,
    chapter_title: "B smoke",
    suggested_game_id: null,
    suggested_map_id: null,
    suggested_target_zone_id: null,
    suggested_stand_zone_id: null,
    suggested_side: null,
    suggested_utility_type_id: null,
    classification_confidence: null,
    classification_reasoning: null,
    target_zone: { id: "z1", slug: "b-site", name: "B Site", polygon_points: [] },
    stand_zone: { id: "z2", slug: "t-spawn", name: "T Spawn", polygon_points: [] },
    utility_type: { id: "u1", slug: "smoke", name: "Smoke" },
    ...over,
  };
}

const GAME: Game = {
  id: "g1",
  slug: "cs2",
  name: "CS2",
  side_a_label: "T",
  side_b_label: "CT",
};

beforeEach(() => {
  // jsdom doesn't implement these — required only when the row is expanded
  // (mounts GlanceBoardTile → ClipView).
  (globalThis as any).IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  delete (globalThis as any).IntersectionObserver;
});

describe("LineupListRow", () => {
  it("renders target zone, stand zone, side, and utility on a single row", () => {
    render(<LineupListRow lineup={makeLineup()} game={GAME} />);
    expect(screen.getByText("B Site")).toBeInTheDocument();
    expect(screen.getByText("T Spawn")).toBeInTheDocument();
    expect(screen.getByText("T")).toBeInTheDocument(); // side label
    expect(screen.getAllByText("Smoke").length).toBeGreaterThan(0);
  });

  it("renders technique when present", () => {
    render(
      <LineupListRow
        lineup={makeLineup({ technique: "standing jumpthrow" })}
        game={GAME}
      />,
    );
    expect(screen.getByText(/standing jumpthrow/)).toBeInTheDocument();
  });

  it("falls back gracefully when target_zone is null", () => {
    render(
      <LineupListRow lineup={makeLineup({ target_zone: null })} game={GAME} />,
    );
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("collapses by default — does not mount the storyboard tile", () => {
    render(<LineupListRow lineup={makeLineup()} game={GAME} />);
    // The corner labels (STAND / AIM / THROW / LANDING) only appear inside
    // the expanded GlanceBoardTile. Absence here proves the tile is unmounted.
    expect(screen.queryByText("THROW")).not.toBeInTheDocument();
    expect(screen.queryByText("LANDING")).not.toBeInTheDocument();
  });

  it("expands on click and mounts the storyboard tile", () => {
    render(<LineupListRow lineup={makeLineup()} game={GAME} />);
    const button = screen.getByRole("button", { name: /click to expand/i });
    expect(button).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");

    // Storyboard's corner labels are now in the DOM
    expect(screen.getByText("STAND")).toBeInTheDocument();
    expect(screen.getByText("AIM")).toBeInTheDocument();
  });

  it("collapses on second click — unmounts the storyboard tile", () => {
    render(<LineupListRow lineup={makeLineup()} game={GAME} />);
    const button = screen.getByRole("button", { name: /click to expand/i });
    fireEvent.click(button);
    expect(screen.getByText("STAND")).toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("STAND")).not.toBeInTheDocument();
  });

  it("uses Valorant side labels when game has them", () => {
    const valGame: Game = {
      id: "g2",
      slug: "valorant",
      name: "Valorant",
      side_a_label: "Atk",
      side_b_label: "Def",
    };
    render(
      <LineupListRow
        lineup={makeLineup({ side: "side_b" })}
        game={valGame}
      />,
    );
    expect(screen.getByText("Def")).toBeInTheDocument();
  });
});
