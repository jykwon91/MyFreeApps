/**
 * LineupListBoard unit tests — list-mode alternate to GlanceBoard.
 *
 * Covers grouping + skeleton + empty-state behavior. Row internals are
 * exercised by LineupListRow's own tests.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import LineupListBoard from "@/components/lineup/LineupListBoard";
import type { Lineup, Game } from "@/types/game";

const GAME: Game = {
  id: "g1",
  slug: "cs2",
  name: "CS2",
  side_a_label: "T",
  side_b_label: "CT",
};

function makeLineup(over: Partial<Lineup> = {}): Lineup {
  return {
    id: "l1",
    game_id: "g1",
    map_id: "m1",
    target_zone_id: "z1",
    stand_zone_id: "z2",
    side: "side_a",
    utility_type_id: "u1",
    title: "Test lineup",
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
    chapter_title: "",
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

beforeEach(() => {
  // Stub for any incidental tile mount via expanded rows in test trees
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
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "IntersectionObserver");
});

describe("LineupListBoard", () => {
  it("renders the skeleton when isFetching is true", () => {
    const { container } = render(
      <LineupListBoard
        lineups={[]}
        isFetching={true}
        mapName="Mirage"
        filteredUtils={[]}
        side="any"
        game={GAME}
      />,
    );
    // Skeleton rows use animate-pulse — count > 0 proves we got the loader
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders the unfiltered empty state when no lineups", () => {
    render(
      <LineupListBoard
        lineups={[]}
        isFetching={false}
        mapName="Mirage"
        filteredUtils={[]}
        side="any"
        game={GAME}
      />,
    );
    expect(screen.getByText(/No lineups on Mirage yet/)).toBeInTheDocument();
  });

  it("renders the filtered empty state hint when side/util filters are active", () => {
    render(
      <LineupListBoard
        lineups={[]}
        isFetching={false}
        mapName="Mirage"
        filteredUtils={["smoke"]}
        side="side_a"
        game={GAME}
      />,
    );
    expect(screen.getByText(/Try clearing filters/)).toBeInTheDocument();
  });

  it("groups lineups by target zone with section headers + counts", () => {
    const lineups = [
      makeLineup({
        id: "l1",
        target_zone: { id: "z1", slug: "b-site", name: "B Site", polygon_points: [] },
      }),
      makeLineup({
        id: "l2",
        target_zone: { id: "z1", slug: "b-site", name: "B Site", polygon_points: [] },
      }),
      makeLineup({
        id: "l3",
        target_zone: { id: "z2", slug: "a-site", name: "A Site", polygon_points: [] },
      }),
    ];
    render(
      <LineupListBoard
        lineups={lineups}
        isFetching={false}
        mapName="Mirage"
        filteredUtils={[]}
        side="any"
        game={GAME}
      />,
    );

    // Zone group headers (h2). Each row also contains the zone name as
    // text inside the row span, so we target by heading role to avoid the
    // multi-match.
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings).toHaveLength(2);
    expect(headings[0]).toHaveTextContent(/A Site/);
    expect(headings[0]).toHaveTextContent("(1)");
    expect(headings[1]).toHaveTextContent(/B Site/);
    expect(headings[1]).toHaveTextContent("(2)");

    // Three row buttons (one per lineup, all collapsed by default)
    expect(screen.getAllByRole("button", { name: /click to expand/i })).toHaveLength(
      3,
    );
  });

  it("does not mount any GlanceBoardTile when all rows are collapsed", () => {
    render(
      <LineupListBoard
        lineups={[makeLineup(), makeLineup({ id: "l2" })]}
        isFetching={false}
        mapName="Mirage"
        filteredUtils={[]}
        side="any"
        game={GAME}
      />,
    );
    // The storyboard's pane labels are not in the DOM until an operator
    // clicks-to-expand. This is the perf invariant of list view.
    expect(screen.queryByText("STAND")).not.toBeInTheDocument();
    expect(screen.queryByText("AIM")).not.toBeInTheDocument();
    expect(screen.queryByText("THROW")).not.toBeInTheDocument();
  });
});
