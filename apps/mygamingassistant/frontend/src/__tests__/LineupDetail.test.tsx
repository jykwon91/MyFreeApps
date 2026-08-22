/**
 * LineupDetail route unit tests.
 *
 * LineupDetail no longer renders a page — a /lineups/:id deep link REDIRECTS
 * into the map board (/{game}/{map}?lineup=<id>, +&edit=<id> for a superuser).
 * These tests mock the RTK Query hooks + useIsSuperuser and assert the resolved
 * location (via a catch-all route that echoes it), plus the not-found paths.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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
    utility_type: { id: "u1", slug: "smoke", name: "Smoke", placement: "thrown", agent: null },
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

// Import page after mocks
import LineupDetail from "@/pages/LineupDetail";

// ---------------------------------------------------------------------------
// Helpers — a catch-all route echoes the resolved location so we can assert
// where LineupDetail redirected to.
// ---------------------------------------------------------------------------
function LocationEcho() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function renderAt(id = "l1") {
  return render(
    <MemoryRouter initialEntries={[`/lineups/${id}`]}>
      <Routes>
        <Route path="/lineups/:id" element={<LineupDetail />} />
        <Route path="*" element={<LocationEcho />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  mockGamesQuery.mockReturnValue({ data: [GAME_CS2], isLoading: false });
  mockMapsQuery.mockReturnValue({ data: [MAP_MIRAGE], isLoading: false });
  mockIsSuperuser.mockReturnValue({ isSuperuser: false });

  // Default: public query loading
  mockPublicQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  mockAdminQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("LineupDetail redirect", () => {
  it("shows the skeleton (no redirect) while the public query is loading", () => {
    mockPublicQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderAt();
    // Neither a redirect nor a not-found — still resolving.
    expect(screen.queryByTestId("location")).toBeNull();
    expect(screen.queryByText("Lineup not found.")).toBeNull();
  });

  it("redirects an accepted lineup into the map board, focused on it (public)", () => {
    mockPublicQuery.mockReturnValue({ data: makeLineup(), isLoading: false, isError: false });
    renderAt();
    expect(screen.getByTestId("location").textContent).toBe("/cs2/mirage?lineup=l1");
  });

  it("appends &edit for a superuser so the pin editor opens on the board", () => {
    mockPublicQuery.mockReturnValue({ data: makeLineup(), isLoading: false, isError: false });
    mockIsSuperuser.mockReturnValue({ isSuperuser: true });
    renderAt();
    expect(screen.getByTestId("location").textContent).toBe("/cs2/mirage?lineup=l1&edit=l1");
  });

  it("shows 'Lineup not found' on 404 for an unauthenticated visitor", () => {
    mockPublicQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    mockIsSuperuser.mockReturnValue({ isSuperuser: false });
    renderAt();
    expect(screen.getByText("Lineup not found.")).toBeDefined();
    // Admin query must NOT have fired (user is not authed)
    expect(mockAdminQuery).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ skip: true }));
  });

  it("falls back to the admin query on 404 when superuser, then redirects", () => {
    mockPublicQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    mockIsSuperuser.mockReturnValue({ isSuperuser: true });
    mockAdminQuery.mockReturnValue({
      data: makeLineup({ status: "pending_review" }),
      isLoading: false,
      isError: false,
    });
    renderAt();
    expect(screen.getByTestId("location").textContent).toBe("/cs2/mirage?lineup=l1&edit=l1");
    // Admin query fired (skip=false because isSuperuser + is404)
    expect(mockAdminQuery).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ skip: false }));
  });

  it("shows 'Lineup not found' when superuser but the admin query also fails", () => {
    mockPublicQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    mockIsSuperuser.mockReturnValue({ isSuperuser: true });
    mockAdminQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderAt();
    expect(screen.getByText("Lineup not found.")).toBeDefined();
  });
});
