/**
 * RoundMode unit tests — the pinned-lineup cards: exactly the active card is marked
 * aria-current, and the empty state links back to plan mode.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import RoundMode from "@/pages/RoundMode";
import type { UsePinsReturn } from "@/hooks/usePins";
import type { Lineup, MapDetail } from "@/types/game";

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
    utility_type: { id: "u1", slug: "smoke", name: "Smoke", placement: "thrown", agent: null },
    ...over,
  };
}

const MAP: MapDetail = {
  id: "m1",
  slug: "mirage",
  name: "Mirage",
  minimap_url: null,
  zones: [],
  sites: [],
  utility_types: [],
  agents: [],
  present_utility_type_slugs: [],
};

const PINNED = ["l1", "l2", "l3"].map((id) => makeLineup({ id, title: `Lineup ${id}` }));

const PINS: UsePinsReturn = {
  pinnedIds: PINNED.map((l) => l.id),
  pin: () => undefined,
  unpin: () => undefined,
  reorder: () => undefined,
  isPinned: () => true,
};

function renderRound(activeCardIndex: number, pinnedLineups: Lineup[] = PINNED) {
  return render(
    <MemoryRouter>
      <RoundMode
        game={undefined}
        mapDetail={MAP}
        side="any"
        pinnedLineups={pinnedLineups}
        isFetching={false}
        activeCardIndex={activeCardIndex}
        exitHref="/cs2/mirage"
        pins={PINS}
        planModeHref="/cs2/mirage"
      />
    </MemoryRouter>,
  );
}

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
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "IntersectionObserver");
});

describe("RoundMode", () => {
  it("marks only the active card aria-current", () => {
    const { container } = renderRound(1);
    const current = container.querySelectorAll('[aria-current="true"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toContainElement(screen.getByRole("heading", { level: 3, name: PINNED[1]!.title }));
  });

  it("marks no card when nothing is pinned and links back to plan mode", () => {
    const { container } = renderRound(0, []);
    expect(container.querySelectorAll("[aria-current]")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Open plan mode to pin some." })).toHaveAttribute("href", "/cs2/mirage");
  });
});
