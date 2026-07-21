/**
 * LineupListRow unit tests — compact-list-row primitive.
 *
 * Stub IntersectionObserver + HTMLMediaElement methods because a single row
 * click mounts GlanceBoardStoryboard's <video>-bearing panes directly.
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
    landing_screenshot_url: null,
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
    utility_type: { id: "u1", slug: "smoke", name: "Smoke", agent: null },
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
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds = [];
  } as unknown as typeof IntersectionObserver;
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
  Reflect.deleteProperty(globalThis, "IntersectionObserver");
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

  it("collapses by default — does not mount the summary tile", () => {
    render(<LineupListRow lineup={makeLineup()} game={GAME} />);
    // The corner labels (STAND / LANDING) only appear inside the expanded
    // GlanceBoardTile. Absence here proves the tile is unmounted.
    expect(screen.queryByText("STAND")).not.toBeInTheDocument();
    expect(screen.queryByText("LANDING")).not.toBeInTheDocument();
  });

  it("row is at least min-h-[44px] tall to fit the mini thumbnails", () => {
    render(<LineupListRow lineup={makeLineup()} game={GAME} />);
    const button = screen.getByRole("button", { name: /click to expand/i });
    expect(button.className).toContain("min-h-[44px]");
  });

  it("renders null-poster mini thumbnails as a muted ImageOff icon", () => {
    render(
      <LineupListRow
        lineup={makeLineup({ stand_screenshot_url: null, landing_screenshot_url: null })}
        game={GAME}
      />,
    );
    // Neither thumbnail has a URL — no <img> should be present in the row
    // (before expansion), only the muted placeholder spans.
    expect(document.querySelectorAll("img").length).toBe(0);
  });

  it("renders mini thumbnails as <img> when poster URLs are present", () => {
    render(
      <LineupListRow
        lineup={makeLineup({
          stand_screenshot_url: "https://ex.com/stand-thumb.png",
          landing_screenshot_url: "https://ex.com/landing-thumb.png",
        })}
        game={GAME}
      />,
    );
    const thumbs = Array.from(document.querySelectorAll("img")).map((i) => i.src);
    expect(thumbs).toContain("https://ex.com/stand-thumb.png");
    expect(thumbs).toContain("https://ex.com/landing-thumb.png");
  });

  it("expands on click and mounts the full 4-pane storyboard directly (STAND / AIM / THROW / LANDING)", () => {
    render(<LineupListRow lineup={makeLineup()} game={GAME} />);
    const button = screen.getByRole("button", { name: /click to expand/i });
    expect(button).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");

    // A single row click now mounts the full storyboard directly — all four
    // panes, no intermediate summary-tile step.
    expect(screen.getByText("STAND")).toBeInTheDocument();
    expect(screen.getByText("AIM")).toBeInTheDocument();
    expect(screen.getByText("THROW")).toBeInTheDocument();
    expect(screen.getByText("LANDING")).toBeInTheDocument();
  });

  it("fires onHover with the lineup id on pointer-enter and null on leave", () => {
    const onHover = vi.fn();
    const lineup = makeLineup();
    const { container } = render(
      <LineupListRow lineup={lineup} game={GAME} onHover={onHover} />,
    );
    const row = container.firstChild as HTMLElement;

    fireEvent.mouseEnter(row);
    expect(onHover).toHaveBeenLastCalledWith(lineup.id);

    fireEvent.mouseLeave(row);
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it("collapses on second click — unmounts the storyboard", () => {
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

  it("uses the shared sideDisplay gold/blue tokens for the side chip", () => {
    render(<LineupListRow lineup={makeLineup({ side: "side_a" })} game={GAME} />);
    const chip = screen.getByText("T");
    expect(chip.className).toContain("bg-yellow-500/20");
  });
});
