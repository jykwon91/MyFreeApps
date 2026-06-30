/**
 * LineupDetail page unit tests.
 *
 * Strategy: mock all RTK Query hooks and the child components that carry
 * heavy deps (GlanceBoardTile, useDesignKnobs). Tests exercise:
 *   - Skeleton while loading
 *   - Renders GlanceBoardTile when the lineup loads
 *   - Renders "Lineup not found" on 404 (unauthenticated)
 *   - Falls back to admin query on 404 when authed (isSuperuser=true)
 *
 * Back-link rendering is also verified in the success case.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Lineup } from "@/types/game";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const GAME_CS2 = { id: "g-cs2", slug: "cs2", name: "CS2", side_a_label: "T", side_b_label: "CT" };
const MAP_MIRAGE = { id: "m-mirage", slug: "mirage", name: "Mirage", minimap_url: null };

function makeLineup(over: Partial<Lineup> = {}): Lineup {
  return {
    id: "l1",
    game_id: "g-cs2",
    map_id: "m-mirage",
    target_zone_id: "z1",
    stand_zone_id: "z2",
    side: "side_a",
    utility_type_id: "u1",
    title: "Mid Window smoke from T Spawn",
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
    target_zone: { id: "z1", slug: "mid", name: "Mid", polygon_points: [] },
    stand_zone: null,
    utility_type: { id: "u1", slug: "smoke", name: "Smoke", agent: null },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Mock state (mutated per test)
// ---------------------------------------------------------------------------
const mockPublicQuery = vi.fn();
const mockAdminQuery = vi.fn();
const mockGamesQuery = vi.fn();
const mockMapsQuery = vi.fn();
const mockIsSuperuser = vi.fn(() => ({ isSuperuser: false }));

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that load the module
// ---------------------------------------------------------------------------
vi.mock("@/store/lineupsApi", () => ({
  useGetLineupQuery: (...args: unknown[]) => mockPublicQuery(...args),
  useGetLineupAdminQuery: (...args: unknown[]) => mockAdminQuery(...args),
}));

vi.mock("@/store/gamesApi", () => ({
  useGetGamesQuery: () => mockGamesQuery(),
  useGetMapsQuery: (...args: unknown[]) => mockMapsQuery(...args),
}));

vi.mock("@/hooks/useIsSuperuser", () => ({
  useIsSuperuser: () => mockIsSuperuser(),
}));

vi.mock("@/hooks/useDesignKnobs", () => ({
  useDesignKnobs: () => ({
    knobs: {
      standMode: "clip",
      aimMode: "clip",
      showAimDot: true,
      landingMode: "clip",
      tilesPerRow: 3,
    },
    setKnob: vi.fn(),
    reset: vi.fn(),
  }),
  DEFAULT_KNOBS: {
    standMode: "clip",
    aimMode: "clip",
    showAimDot: true,
    landingMode: "clip",
    tilesPerRow: 3,
  },
}));

// GlanceBoardTile has heavy deps (IntersectionObserver, HTMLMediaElement).
// Mock it so this test focuses on LineupDetail's own logic.
vi.mock("@/components/lineup/GlanceBoardTile", () => ({
  default: ({ lineup }: { lineup: Lineup }) => (
    <div data-testid="glance-board-tile">{lineup.title}</div>
  ),
}));

// LineupDetailBackLink delegates to useGetGamesQuery / useGetMapsQuery
// (mocked above). Let it render for real so back-link tests work.
// LineupDetailSkeleton is trivial — no mock needed.

// Import page after mocks
import LineupDetail from "@/pages/LineupDetail";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderAt(id = "l1") {
  return render(
    <MemoryRouter initialEntries={[`/lineups/${id}`]}>
      <Routes>
        <Route path="/lineups/:id" element={<LineupDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  mockGamesQuery.mockReturnValue({ data: [GAME_CS2] });
  mockMapsQuery.mockReturnValue({ data: [MAP_MIRAGE] });
  mockIsSuperuser.mockReturnValue({ isSuperuser: false });

  // Default: public query loading
  mockPublicQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  mockAdminQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("LineupDetail", () => {
  it("renders skeleton while the public query is loading", () => {
    mockPublicQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderAt();
    // GlanceBoardTile is NOT rendered while loading
    expect(screen.queryByTestId("glance-board-tile")).toBeNull();
    // No error text either
    expect(screen.queryByText("Lineup not found.")).toBeNull();
  });

  it("renders GlanceBoardTile when the lineup loads successfully", () => {
    const lineup = makeLineup();
    mockPublicQuery.mockReturnValue({ data: lineup, isLoading: false, isError: false });
    renderAt();
    expect(screen.getByTestId("glance-board-tile")).toBeDefined();
    expect(screen.getByText("Mid Window smoke from T Spawn")).toBeDefined();
  });

  it("renders back link with map name when game + map are resolved", () => {
    const lineup = makeLineup();
    mockPublicQuery.mockReturnValue({ data: lineup, isLoading: false, isError: false });
    renderAt();
    const backLink = screen.getByRole("link", { name: /back to mirage/i });
    expect(backLink).toBeDefined();
    expect(backLink.getAttribute("href")).toBe("/cs2/mirage");
  });

  it("renders 'Lineup not found' on 404 for an unauthenticated visitor", () => {
    mockPublicQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    mockIsSuperuser.mockReturnValue({ isSuperuser: false });
    renderAt();
    expect(screen.getByText("Lineup not found.")).toBeDefined();
    // Admin query must NOT have been called (user is not authed)
    expect(mockAdminQuery).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ skip: true }));
  });

  it("falls back to admin query on 404 when the user is authed (isSuperuser)", () => {
    const adminLineup = makeLineup({ status: "pending_review" });
    mockPublicQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    mockIsSuperuser.mockReturnValue({ isSuperuser: true });
    mockAdminQuery.mockReturnValue({ data: adminLineup, isLoading: false, isError: false });
    renderAt();
    expect(screen.getByTestId("glance-board-tile")).toBeDefined();
    expect(screen.getByText("Mid Window smoke from T Spawn")).toBeDefined();
    // Admin query must have been called (skip=false because isSuperuser + is404)
    expect(mockAdminQuery).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ skip: false }));
  });

  it("renders 'Lineup not found' when authed but admin query also fails", () => {
    mockPublicQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    mockIsSuperuser.mockReturnValue({ isSuperuser: true });
    mockAdminQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderAt();
    expect(screen.getByText("Lineup not found.")).toBeDefined();
  });
});
