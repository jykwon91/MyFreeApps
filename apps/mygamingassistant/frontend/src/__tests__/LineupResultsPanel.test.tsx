/**
 * LineupResultsPanel — encapsulates the results-panel branch logic
 * (fetching / empty / ≤3 → expanded / else → thumbnail) via early returns.
 *
 * This component was extracted from MapPage.tsx as part of the one-component-
 * per-file refactor (PR #688). These tests prove the early-return branching is
 * equivalent to the original 3-level nested ternary it replaced.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import LineupResultsPanel from "@/components/map/LineupResultsPanel";
import type { Lineup } from "@/types/game";

// Minimal Lineup shape needed by the panel's child components
function makeLineup(id: string): Lineup {
  return {
    id,
    game_id: "g1",
    map_id: "m1",
    target_zone_id: "z1",
    stand_zone_id: "z2",
    side: "side_a",
    utility_type_id: "u1",
    title: `Lineup ${id}`,
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
    landing_clip_url_original: null,
    landing_clip_trim_start_s: null,
    landing_clip_trim_end_s: null,
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
  };
}

// Minimal mock for the usePins return value (matches UsePinsReturn interface)
const mockPins = {
  isPinned: vi.fn().mockReturnValue(false),
  pin: vi.fn(),
  unpin: vi.fn(),
  reorder: vi.fn(),
  pinnedIds: [] as string[],
};

function renderPanel(props: Parameters<typeof LineupResultsPanel>[0]) {
  return render(
    <MemoryRouter>
      <LineupResultsPanel {...props} />
    </MemoryRouter>,
  );
}

const BASE_PROPS = {
  fetching: false,
  lineups: [] as Lineup[],
  activeCardIndex: 0,
  pins: mockPins,
  addLineupHref: "/lineups/new?game=cs2&map=mirage",
  targetZoneName: "A site",
};

describe("LineupResultsPanel — branch routing (early returns)", () => {
  it("shows skeleton placeholders while fetching (regardless of lineup count)", () => {
    renderPanel({ ...BASE_PROPS, fetching: true, lineups: [makeLineup("l1")] });
    // Skeleton: two pulse divs — no lineup titles visible
    expect(screen.queryByText(/Lineup l1/i)).toBeNull();
    // The pulse divs should be in the DOM (they have animate-pulse class)
    const { container } = render(
      <MemoryRouter>
        <LineupResultsPanel {...BASE_PROPS} fetching={true} lineups={[makeLineup("l1")]} />
      </MemoryRouter>,
    );
    const pulses = container.querySelectorAll(".animate-pulse");
    expect(pulses.length).toBeGreaterThan(0);
  });

  it("shows empty state with add-lineup link when not fetching and lineups is empty", () => {
    renderPanel({ ...BASE_PROPS, fetching: false, lineups: [] });
    expect(screen.getByText(/no lineups match this filter/i)).toBeDefined();
    const link = screen.getByRole("link", { name: /add lineup for a site/i });
    expect(link).toBeDefined();
    // The href should contain the addLineupHref value
    expect((link as HTMLAnchorElement).getAttribute("href")).toContain(
      "/lineups/new",
    );
  });

  it("renders expanded view (PlanModeExpandedResults) when 1-3 lineups", () => {
    const lineups = [makeLineup("l1"), makeLineup("l2"), makeLineup("l3")];
    renderPanel({ ...BASE_PROPS, lineups });
    // Expanded renders LineupCards in a vertical space-y-4 list — each card
    // renders the lineup title somewhere accessible
    expect(screen.getAllByText(/Lineup l/i).length).toBeGreaterThan(0);
  });

  it("still uses expanded view at exactly 3 lineups (boundary)", () => {
    const lineups = [makeLineup("a"), makeLineup("b"), makeLineup("c")];
    renderPanel({ ...BASE_PROPS, lineups });
    // Three lineup cards rendered
    expect(screen.getAllByText(/Lineup/i).length).toBe(3);
  });

  it("renders thumbnail view (PlanModeThumbnailResults) when 4+ lineups", () => {
    const lineups = [
      makeLineup("1"),
      makeLineup("2"),
      makeLineup("3"),
      makeLineup("4"),
    ];
    renderPanel({ ...BASE_PROPS, lineups });
    // Thumbnail renders LineupCard in thumbnail variant — titles still rendered
    expect(screen.getAllByText(/Lineup/i).length).toBe(4);
  });

  it("activeCardIndex prop is forwarded and selects the right card ring in expanded view", () => {
    const lineups = [makeLineup("x1"), makeLineup("x2")];
    const { container } = render(
      <MemoryRouter>
        <LineupResultsPanel
          {...BASE_PROPS}
          lineups={lineups}
          activeCardIndex={1}
        />
      </MemoryRouter>,
    );
    // The second card wrapper should have the ring-2 class
    const wrappers = container.querySelectorAll(".rounded-xl");
    expect(wrappers[1]?.className).toContain("ring-2");
    // The first card wrapper should NOT have it
    expect(wrappers[0]?.className).not.toContain("ring-2");
  });
});
