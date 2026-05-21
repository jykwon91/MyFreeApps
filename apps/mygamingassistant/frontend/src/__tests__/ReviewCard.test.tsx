/**
 * ReviewCard unit tests — Accept button gating + missing-fields hint
 * (fix/mga-reviewcard-manual-classification).
 *
 * Context: PR #682 added cascading Game/Map/Zone/Utility selects to ReviewCard.
 * The selects exist, but the Accept button was never gated on required fields —
 * it only disabled on `isAccepting`. This left unclassified lineups un-acceptable
 * (the backend raises 422 with "missing required fields" for null classification).
 *
 * This PR adds:
 *  - `canAccept` gate: Accept disabled until target_zone_id, stand_zone_id,
 *    side, and utility_type_id are all non-empty.
 *  - Inline hint: when Accept is disabled, shows which fields are still missing.
 *
 * Tests:
 *  Rendering
 *  - Game / Map / Zone / Side / Utility selects are rendered
 *  - Pre-populates selects from suggested_* values (classifier happy path)
 *  Accept gating
 *  - Accept disabled when lineup has no classification fields
 *  - Accept disabled when any one of the four required fields is missing
 *  - Accept enabled when all four required fields are set
 *  - Accept becomes enabled after manually selecting all required fields
 *  Inline hint
 *  - Hint visible when required fields are missing; lists each missing field
 *  - Hint hidden when all required fields are set
 *  Accept body
 *  - Correct body sent when Accept is clicked on a classified lineup
 *  Re-classify
 *  - Selects repopulate after Re-classify returns new suggested values
 *
 * Strategy: mock the three RTK Query hooks (useGetGamesQuery, useGetMapsQuery,
 * useGetMapDetailQuery) so selects render synchronously, and mock the mutation
 * hooks so we can verify call arguments without a real store.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ReviewCard from "@/components/review/ReviewCard";
import type { Lineup, ClassifyResponse } from "@/types/game";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GAME_CS2 = { id: "g-cs2", slug: "cs2", name: "CS2", side_a_label: "T", side_b_label: "CT" };
const GAME_VAL = { id: "g-val", slug: "valorant", name: "Valorant", side_a_label: "Attacker", side_b_label: "Defender" };

const MAP_MIRAGE = { id: "m-mirage", slug: "mirage", name: "Mirage", minimap_url: null };
const MAP_DUST2 = { id: "m-dust2", slug: "dust2", name: "Dust II", minimap_url: null };

const ZONE_A = { id: "z-a", slug: "a-site", name: "A Site", polygon_points: [] };
const ZONE_B = { id: "z-b", slug: "b-site", name: "B Site", polygon_points: [] };

const UTIL_SMOKE = { id: "u-smoke", slug: "smoke", name: "Smoke" };
const UTIL_FLASH = { id: "u-flash", slug: "flash", name: "Flash" };

const MAP_DETAIL = {
  id: "m-mirage",
  slug: "mirage",
  name: "Mirage",
  minimap_url: null,
  zones: [ZONE_A, ZONE_B],
  sites: [],
  utility_types: [UTIL_SMOKE, UTIL_FLASH],
};

/** A fully-unclassified pending lineup — no suggested_* values, all classification null. */
function makeUnclassifiedLineup(overrides: Partial<Lineup> = {}): Lineup {
  return {
    id: "lineup-unclassified",
    game_id: "g-cs2",
    map_id: "m-mirage",
    target_zone_id: null,
    stand_zone_id: null,
    side: null,
    utility_type_id: null,
    title: "Unclassified Lineup",
    notes: null,
    stand_screenshot_url: null,
    aim_screenshot_url: null,
    clip_url: null,
    landing_clip_url: null,
    stand_clip_url: null,
    aim_clip_url: null,
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

/** A fully-classified lineup — classifier set all required fields via suggested_*. */
function makeClassifiedLineup(overrides: Partial<Lineup> = {}): Lineup {
  return makeUnclassifiedLineup({
    suggested_game_id: GAME_CS2.id,
    suggested_map_id: MAP_MIRAGE.id,
    suggested_target_zone_id: ZONE_A.id,
    suggested_stand_zone_id: ZONE_B.id,
    suggested_side: "side_a",
    suggested_utility_type_id: UTIL_SMOKE.id,
    classification_confidence: 0.9,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGamesQuery = vi.fn().mockReturnValue({
  data: [GAME_CS2, GAME_VAL],
  isLoading: false,
  isFetching: false,
  isError: false,
});
const mockMapsQuery = vi.fn().mockReturnValue({
  data: [MAP_MIRAGE, MAP_DUST2],
  isLoading: false,
  isFetching: false,
  isError: false,
});
const mockMapDetailQuery = vi.fn().mockReturnValue({
  data: MAP_DETAIL,
  isLoading: false,
  isFetching: false,
  isError: false,
});

vi.mock("@/store/gamesApi", () => ({
  useGetGamesQuery: () => mockGamesQuery(),
  useGetMapsQuery: (..._args: unknown[]) => mockMapsQuery(..._args),
  useGetMapDetailQuery: (..._args: unknown[]) => mockMapDetailQuery(..._args),
}));

const mockAcceptUnwrap = vi.fn().mockResolvedValue({});
const mockAcceptFn = vi.fn().mockReturnValue({ unwrap: mockAcceptUnwrap });
const mockAcceptMutation = vi.fn().mockReturnValue([
  mockAcceptFn,
  { isLoading: false },
]);

const mockHideMutation = vi.fn().mockReturnValue([
  vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) }),
  { isLoading: false },
]);

const mockReclassifyUnwrap = vi.fn();
const mockReclassifyFn = vi.fn().mockReturnValue({ unwrap: mockReclassifyUnwrap });
const mockReclassifyMutation = vi.fn().mockReturnValue([
  mockReclassifyFn,
  { isLoading: false },
]);

vi.mock("@/store/lineupsApi", () => ({
  useAcceptLineupMutation: () => mockAcceptMutation(),
  useHideLineupMutation: () => mockHideMutation(),
  useReclassifyLineupMutation: () => mockReclassifyMutation(),
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showError: vi.fn(),
    showSuccess: vi.fn(),
    extractErrorMessage: vi.fn((e: unknown) => String(e)),
    // ConfirmDialog: render children so hide button interaction works in tests
    ConfirmDialog: ({ open, onCancel }: { open: boolean; onCancel: () => void }) =>
      open ? (
        <dialog open>
          <button type="button" onClick={onCancel}>Cancel</button>
        </dialog>
      ) : null,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderCard(lineup: Lineup) {
  return render(
    <ReviewCard lineup={lineup} checked={false} onCheckToggle={vi.fn()} />,
  );
}

// ---------------------------------------------------------------------------
// Tests: selector rendering
// ---------------------------------------------------------------------------

describe("ReviewCard — classification selector rendering", () => {
  beforeEach(() => {
    mockGamesQuery.mockReturnValue({ data: [GAME_CS2, GAME_VAL], isLoading: false, isFetching: false, isError: false });
    mockMapsQuery.mockReturnValue({ data: [MAP_MIRAGE, MAP_DUST2], isLoading: false, isFetching: false, isError: false });
    mockMapDetailQuery.mockReturnValue({ data: MAP_DETAIL, isLoading: false, isFetching: false, isError: false });
  });

  it("renders all available game options", () => {
    renderCard(makeUnclassifiedLineup());
    expect(screen.getByText("CS2")).toBeDefined();
    expect(screen.getByText("Valorant")).toBeDefined();
  });

  it("pre-selects the game from suggested_game_id", () => {
    renderCard(makeClassifiedLineup());
    // The Game select's value should match GAME_CS2.id
    const selects = screen.getAllByRole("combobox");
    const gameSelect = selects[0] as HTMLSelectElement;
    expect(gameSelect.value).toBe(GAME_CS2.id);
  });

  it("pre-selects the map from suggested_map_id", () => {
    renderCard(makeClassifiedLineup());
    const selects = screen.getAllByRole("combobox");
    const mapSelect = selects[1] as HTMLSelectElement;
    expect(mapSelect.value).toBe(MAP_MIRAGE.id);
  });

  it("pre-selects the utility type from suggested_utility_type_id", () => {
    renderCard(makeClassifiedLineup());
    const selects = screen.getAllByRole("combobox");
    const utilSelect = selects[2] as HTMLSelectElement;
    expect(utilSelect.value).toBe(UTIL_SMOKE.id);
  });

  it("pre-selects the stand zone from suggested_stand_zone_id", () => {
    renderCard(makeClassifiedLineup());
    const selects = screen.getAllByRole("combobox");
    const standSelect = selects[3] as HTMLSelectElement;
    expect(standSelect.value).toBe(ZONE_B.id);
  });

  it("pre-selects the target zone from suggested_target_zone_id", () => {
    renderCard(makeClassifiedLineup());
    const selects = screen.getAllByRole("combobox");
    const targetSelect = selects[4] as HTMLSelectElement;
    expect(targetSelect.value).toBe(ZONE_A.id);
  });
});

// ---------------------------------------------------------------------------
// Tests: Accept button gating
// ---------------------------------------------------------------------------

describe("ReviewCard — Accept button gating", () => {
  beforeEach(() => {
    mockGamesQuery.mockReturnValue({ data: [GAME_CS2, GAME_VAL], isLoading: false, isFetching: false, isError: false });
    mockMapsQuery.mockReturnValue({ data: [MAP_MIRAGE, MAP_DUST2], isLoading: false, isFetching: false, isError: false });
    mockMapDetailQuery.mockReturnValue({ data: MAP_DETAIL, isLoading: false, isFetching: false, isError: false });
  });

  it("Accept is disabled when lineup has no classification fields set", () => {
    renderCard(makeUnclassifiedLineup());
    expect(screen.getByRole("button", { name: /^accept$/i })).toBeDisabled();
  });

  it("Accept is disabled when target zone is missing", () => {
    renderCard(makeClassifiedLineup({ suggested_target_zone_id: null }));
    expect(screen.getByRole("button", { name: /^accept$/i })).toBeDisabled();
  });

  it("Accept is disabled when stand zone is missing", () => {
    renderCard(makeClassifiedLineup({ suggested_stand_zone_id: null }));
    expect(screen.getByRole("button", { name: /^accept$/i })).toBeDisabled();
  });

  it("Accept is disabled when side is missing", () => {
    renderCard(makeClassifiedLineup({ suggested_side: null }));
    expect(screen.getByRole("button", { name: /^accept$/i })).toBeDisabled();
  });

  it("Accept is disabled when utility type is missing", () => {
    renderCard(makeClassifiedLineup({ suggested_utility_type_id: null }));
    expect(screen.getByRole("button", { name: /^accept$/i })).toBeDisabled();
  });

  it("Accept is enabled when all four required fields are set", () => {
    renderCard(makeClassifiedLineup());
    expect(screen.getByRole("button", { name: /^accept$/i })).not.toBeDisabled();
  });

  it("Accept becomes enabled after manually setting all required fields", () => {
    renderCard(makeUnclassifiedLineup());

    const selects = screen.getAllByRole("combobox");
    // Game (index 0), Map (1), Utility (2), Stand zone (3), Target zone (4), Side (5)
    const [, , utilSelect, standSelect, targetSelect, sideSelect] = selects;

    fireEvent.change(targetSelect, { target: { value: ZONE_A.id } });
    fireEvent.change(standSelect, { target: { value: ZONE_B.id } });
    fireEvent.change(sideSelect, { target: { value: "side_a" } });
    fireEvent.change(utilSelect, { target: { value: UTIL_SMOKE.id } });

    expect(screen.getByRole("button", { name: /^accept$/i })).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Tests: inline missing-fields hint
// ---------------------------------------------------------------------------

describe("ReviewCard — missing fields hint", () => {
  beforeEach(() => {
    mockGamesQuery.mockReturnValue({ data: [GAME_CS2, GAME_VAL], isLoading: false, isFetching: false, isError: false });
    mockMapsQuery.mockReturnValue({ data: [MAP_MIRAGE, MAP_DUST2], isLoading: false, isFetching: false, isError: false });
    mockMapDetailQuery.mockReturnValue({ data: MAP_DETAIL, isLoading: false, isFetching: false, isError: false });
  });

  it("shows the hint when required fields are missing", () => {
    renderCard(makeUnclassifiedLineup());
    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.getByText(/set required fields to accept/i)).toBeDefined();
  });

  it("hint lists 'target zone' when target_zone_id is missing", () => {
    renderCard(makeUnclassifiedLineup());
    expect(screen.getByRole("status").textContent).toContain("target zone");
  });

  it("hint lists 'stand zone' when stand_zone_id is missing", () => {
    renderCard(makeUnclassifiedLineup());
    expect(screen.getByRole("status").textContent).toContain("stand zone");
  });

  it("hint lists 'side' when side is missing", () => {
    renderCard(makeUnclassifiedLineup());
    expect(screen.getByRole("status").textContent).toContain("side");
  });

  it("hint lists 'utility type' when utility_type_id is missing", () => {
    renderCard(makeUnclassifiedLineup());
    expect(screen.getByRole("status").textContent).toContain("utility type");
  });

  it("hint is hidden when all required fields are set", () => {
    renderCard(makeClassifiedLineup());
    expect(screen.queryByRole("status")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: Accept sends correct body
// ---------------------------------------------------------------------------

describe("ReviewCard — Accept sends correct body", () => {
  beforeEach(() => {
    mockGamesQuery.mockReturnValue({ data: [GAME_CS2, GAME_VAL], isLoading: false, isFetching: false, isError: false });
    mockMapsQuery.mockReturnValue({ data: [MAP_MIRAGE, MAP_DUST2], isLoading: false, isFetching: false, isError: false });
    mockMapDetailQuery.mockReturnValue({ data: MAP_DETAIL, isLoading: false, isFetching: false, isError: false });
    mockAcceptFn.mockClear();
    mockAcceptUnwrap.mockClear().mockResolvedValue({});
    mockAcceptMutation.mockReturnValue([mockAcceptFn, { isLoading: false }]);
  });

  it("sends all four required fields in the accept body", async () => {
    renderCard(makeClassifiedLineup());
    fireEvent.click(screen.getByRole("button", { name: /^accept$/i }));

    await waitFor(() => expect(mockAcceptFn).toHaveBeenCalledTimes(1));

    const call = mockAcceptFn.mock.calls[0] as [{ id: string; body: Record<string, unknown> }];
    const { body } = call[0];
    expect(body.target_zone_id).toBe(ZONE_A.id);
    expect(body.stand_zone_id).toBe(ZONE_B.id);
    expect(body.side).toBe("side_a");
    expect(body.utility_type_id).toBe(UTIL_SMOKE.id);
  });

  it("sends the correct lineup id", async () => {
    const lineup = makeClassifiedLineup({ id: "lineup-specific-id" });
    render(<ReviewCard lineup={lineup} checked={false} onCheckToggle={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^accept$/i }));

    await waitFor(() => expect(mockAcceptFn).toHaveBeenCalledTimes(1));
    const call = mockAcceptFn.mock.calls[0] as [{ id: string; body: Record<string, unknown> }];
    expect(call[0].id).toBe("lineup-specific-id");
  });
});

// ---------------------------------------------------------------------------
// Tests: Re-classify repopulates selects
// ---------------------------------------------------------------------------

describe("ReviewCard — Re-classify repopulates selects", () => {
  beforeEach(() => {
    mockGamesQuery.mockReturnValue({ data: [GAME_CS2, GAME_VAL], isLoading: false, isFetching: false, isError: false });
    mockMapsQuery.mockReturnValue({ data: [MAP_MIRAGE, MAP_DUST2], isLoading: false, isFetching: false, isError: false });
    mockMapDetailQuery.mockReturnValue({ data: MAP_DETAIL, isLoading: false, isFetching: false, isError: false });
  });

  it("repopulates game/map/zone/utility/side after successful Re-classify", async () => {
    const classifyResult: ClassifyResponse = {
      lineup_id: "lineup-unclassified",
      success: true,
      suggested_game_id: GAME_CS2.id,
      suggested_map_id: MAP_MIRAGE.id,
      suggested_target_zone_id: ZONE_A.id,
      suggested_stand_zone_id: ZONE_B.id,
      suggested_side: "side_b",
      suggested_utility_type_id: UTIL_FLASH.id,
      aim_anchor_x: 0.5,
      aim_anchor_y: 0.4,
      confidence: 0.85,
      reasoning: "Classified from screenshot.",
      error_codes: [],
    };

    mockReclassifyUnwrap.mockResolvedValue(classifyResult);
    mockReclassifyMutation.mockReturnValue([mockReclassifyFn, { isLoading: false }]);

    renderCard(makeUnclassifiedLineup());

    // Before re-classify: accept is disabled (no fields set)
    expect(screen.getByRole("button", { name: /^accept$/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /re-classify/i }));
    await waitFor(() => expect(mockReclassifyFn).toHaveBeenCalledTimes(1));

    // After re-classify: selects should reflect new suggested values.
    // Use waitFor since state update is async.
    await waitFor(() => {
      const selects = screen.getAllByRole("combobox");
      const gameSelect = selects[0] as HTMLSelectElement;
      expect(gameSelect.value).toBe(GAME_CS2.id);
    });

    const selects = screen.getAllByRole("combobox");
    expect((selects[1] as HTMLSelectElement).value).toBe(MAP_MIRAGE.id);
    expect((selects[2] as HTMLSelectElement).value).toBe(UTIL_FLASH.id);
    expect((selects[3] as HTMLSelectElement).value).toBe(ZONE_B.id);
    expect((selects[4] as HTMLSelectElement).value).toBe(ZONE_A.id);
    expect((selects[5] as HTMLSelectElement).value).toBe("side_b");

    // Accept should now be enabled (all four required fields set by re-classify)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^accept$/i })).not.toBeDisabled();
    });
  });
});
