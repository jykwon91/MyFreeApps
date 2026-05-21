/**
 * countUnplaceableLineups — drives the MapPage "can't be shown on the map
 * yet" hint (Task 7). A lineup is unplaceable when neither its stand nor its
 * target endpoint resolved (no explicit anchor AND the referenced zone has
 * no polygon to take a centroid from).
 *
 * Mode semantics mirror MapLineupPins:
 *   - "stand"  → unplaceable when the stand endpoint is missing
 *   - "target" → unplaceable when the target endpoint is missing
 *   - "both"   → unplaceable only when BOTH endpoints are missing
 */
import { describe, expect, it } from "vitest";
import { countUnplaceableLineups } from "@/components/lineup/MapLineupPins";
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
    landing_clip_url: null,
    stand_clip_url: null,
    aim_clip_url: null,
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
    ...overrides,
  };
}

describe("countUnplaceableLineups", () => {
  it("counts a lineup with no coords at all as unplaceable in every mode", () => {
    const lineups = [makeLineup({ id: "a" })];
    expect(countUnplaceableLineups(lineups, "stand")).toBe(1);
    expect(countUnplaceableLineups(lineups, "target")).toBe(1);
    expect(countUnplaceableLineups(lineups, "both")).toBe(1);
  });

  it("counts zero when every lineup resolves", () => {
    const lineups = [
      makeLineup({
        id: "a",
        effective_stand_x: 0.2,
        effective_stand_y: 0.3,
        effective_target_x: 0.7,
        effective_target_y: 0.8,
      }),
    ];
    expect(countUnplaceableLineups(lineups, "both")).toBe(0);
    expect(countUnplaceableLineups(lineups, "stand")).toBe(0);
    expect(countUnplaceableLineups(lineups, "target")).toBe(0);
  });

  it("in 'both' mode a lineup with only a stand endpoint is placeable", () => {
    const lineups = [
      makeLineup({ id: "a", effective_stand_x: 0.5, effective_stand_y: 0.5 }),
    ];
    expect(countUnplaceableLineups(lineups, "both")).toBe(0);
    // ...but in target mode that same lineup is unplaceable.
    expect(countUnplaceableLineups(lineups, "target")).toBe(1);
  });

  it("treats a half-set endpoint (x but no y) as missing", () => {
    const lineups = [
      makeLineup({ id: "a", effective_stand_x: 0.5, effective_stand_y: null }),
    ];
    expect(countUnplaceableLineups(lineups, "stand")).toBe(1);
  });

  it("counts only the unplaceable subset across a mixed list", () => {
    const lineups = [
      makeLineup({ id: "ok", effective_stand_x: 0.1, effective_stand_y: 0.1 }),
      makeLineup({ id: "bad-1" }),
      makeLineup({ id: "bad-2" }),
    ];
    expect(countUnplaceableLineups(lineups, "stand")).toBe(2);
  });

  it("returns 0 for an empty list", () => {
    expect(countUnplaceableLineups([], "both")).toBe(0);
  });
});
