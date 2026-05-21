/**
 * LineupCard unit tests.
 *
 * Tests:
 * - Thumbnail variant renders title + stand screenshot
 * - Expanded variant renders both screenshots, metadata, notes
 * - Aim anchor overlay renders at correct position when coords are set
 * - Aim anchor is absent when coords are null
 * - Pin button renders when onPinToggle is provided (both variants)
 * - Pin button absent when onPinToggle is not provided
 * - Pin button calls onPinToggle on click
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LineupCard from "@/components/lineup/LineupCard";
import type { Lineup } from "@/types/game";

// jsdom doesn't implement HTMLMediaElement.play/pause — when the expanded
// variant mounts ClipView (for the THROW pane on a lineup with clip_url),
// its useEffect calls el.play().catch(...) which would throw on the
// undefined return. Stub locally rather than globally to keep blast radius
// to this file (same posture as GlanceBoardTile.test.tsx).
beforeEach(() => {
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const BASE_LINEUP: Lineup = {
  id: "lineup-1",
  game_id: "game-1",
  map_id: "map-1",
  target_zone_id: "zone-1",
  stand_zone_id: "zone-2",
  side: "side_a",
  utility_type_id: "util-1",
  title: "A-site smoke from CT",
  notes: "Stand on the crate",
  stand_screenshot_url: "https://example.com/stand.png",
  aim_screenshot_url: "https://example.com/aim.png",
  clip_url: null,
  technique: null,
  aim_anchor_x: 0.5,
  aim_anchor_y: 0.4,
  stand_anchor_x: null,
  stand_anchor_y: null,
  target_anchor_x: null,
  target_anchor_y: null,
  effective_stand_x: null,
  effective_stand_y: null,
  effective_target_x: null,
  effective_target_y: null,
  setup_seconds: 8,
  attribution_url: null,
  attribution_author: null,
  status: "accepted",
  // YouTube ingestion metadata
  youtube_video_id: null,
  chapter_start_seconds: null,
  chapter_title: null,
  // Classifier suggestions
  suggested_game_id: null,
  suggested_map_id: null,
  suggested_target_zone_id: null,
  suggested_stand_zone_id: null,
  suggested_side: null,
  suggested_utility_type_id: null,
  classification_confidence: null,
  classification_reasoning: null,
  target_zone: { id: "zone-1", slug: "a-site", name: "A Site", polygon_points: [] },
  stand_zone: { id: "zone-2", slug: "ct-spawn", name: "CT Spawn", polygon_points: [] },
  utility_type: { id: "util-1", slug: "smoke", name: "Smoke" },
};

describe("LineupCard", () => {
  it("thumbnail variant renders title", () => {
    render(<LineupCard lineup={BASE_LINEUP} variant="thumbnail" />);
    expect(screen.getByText("A-site smoke from CT")).toBeDefined();
  });

  it("thumbnail variant renders stand screenshot", () => {
    render(<LineupCard lineup={BASE_LINEUP} variant="thumbnail" />);
    const img = screen.getByAltText("A-site smoke from CT — stand position");
    expect(img).toBeDefined();
  });

  it("expanded variant renders both screenshots", () => {
    render(<LineupCard lineup={BASE_LINEUP} variant="expanded" />);
    const standImg = screen.getByAltText("A-site smoke from CT — stand position");
    const aimImg = screen.getByAltText("A-site smoke from CT — aim reference");
    expect(standImg).toBeDefined();
    expect(aimImg).toBeDefined();
  });

  it("expanded variant renders utility type badge", () => {
    render(<LineupCard lineup={BASE_LINEUP} variant="expanded" />);
    expect(screen.getByText("Smoke")).toBeDefined();
  });

  it("expanded variant renders notes", () => {
    render(<LineupCard lineup={BASE_LINEUP} variant="expanded" />);
    expect(screen.getByText("Stand on the crate")).toBeDefined();
  });

  it("expanded variant renders setup_seconds badge", () => {
    render(<LineupCard lineup={BASE_LINEUP} variant="expanded" />);
    expect(screen.getByText("8s")).toBeDefined();
  });

  it("expanded variant renders aim anchor when coords are set", () => {
    render(<LineupCard lineup={BASE_LINEUP} variant="expanded" />);
    const anchor = screen.getByLabelText(/aim anchor/i);
    expect(anchor).toBeDefined();
  });

  it("expanded variant omits aim anchor when coords are null", () => {
    const lineup: Lineup = { ...BASE_LINEUP, aim_anchor_x: null, aim_anchor_y: null };
    render(<LineupCard lineup={lineup} variant="expanded" />);
    const anchor = screen.queryByLabelText(/aim anchor/i);
    expect(anchor).toBeNull();
  });

  it("expanded variant renders 'No screenshot' when screenshot URL is null", () => {
    const lineup: Lineup = { ...BASE_LINEUP, stand_screenshot_url: null };
    render(<LineupCard lineup={lineup} variant="expanded" />);
    const noShots = screen.getAllByText("No screenshot");
    expect(noShots.length).toBeGreaterThan(0);
  });

  it("thumbnail calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<LineupCard lineup={BASE_LINEUP} variant="thumbnail" onClick={onClick} />);
    screen.getByRole("button", { name: /view a-site smoke/i }).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // --- Pin toggle ---

  it("expanded variant shows pin button when onPinToggle is provided", () => {
    render(
      <LineupCard
        lineup={BASE_LINEUP}
        variant="expanded"
        onPinToggle={vi.fn()}
        isPinned={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Pin lineup" })).toBeDefined();
  });

  it("expanded variant shows 'Unpin lineup' when isPinned=true", () => {
    render(
      <LineupCard
        lineup={BASE_LINEUP}
        variant="expanded"
        onPinToggle={vi.fn()}
        isPinned={true}
      />,
    );
    expect(screen.getByRole("button", { name: "Unpin lineup" })).toBeDefined();
  });

  it("expanded variant calls onPinToggle on pin button click", async () => {
    const onPinToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <LineupCard
        lineup={BASE_LINEUP}
        variant="expanded"
        onPinToggle={onPinToggle}
        isPinned={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Pin lineup" }));
    expect(onPinToggle).toHaveBeenCalledTimes(1);
  });

  it("expanded variant hides pin button when onPinToggle is absent", () => {
    render(<LineupCard lineup={BASE_LINEUP} variant="expanded" />);
    expect(screen.queryByRole("button", { name: /pin lineup/i })).toBeNull();
  });

  it("thumbnail variant shows pin button when onPinToggle is provided", () => {
    render(
      <LineupCard
        lineup={BASE_LINEUP}
        variant="thumbnail"
        onPinToggle={vi.fn()}
        isPinned={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Pin lineup" })).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // PR4 — 2×2 storyboard (expanded variant only; thumbnail unchanged)
  // ---------------------------------------------------------------------------

  it("expanded variant renders all four pane labels (STAND, AIM, THROW, LANDING)", () => {
    render(<LineupCard lineup={BASE_LINEUP} variant="expanded" />);
    expect(screen.getByText("STAND")).toBeInTheDocument();
    expect(screen.getByText("AIM")).toBeInTheDocument();
    expect(screen.getByText("THROW")).toBeInTheDocument();
    expect(screen.getByText("LANDING")).toBeInTheDocument();
  });

  it("expanded variant LANDING pane shows target_zone.name", () => {
    render(<LineupCard lineup={BASE_LINEUP} variant="expanded" />);
    expect(screen.getByText("Lands in")).toBeInTheDocument();
    // BASE_LINEUP.target_zone.name = "A Site". Both the LANDING pane and the
    // zone-context footer render that string; getAllByText covers either.
    expect(screen.getAllByText("A Site").length).toBeGreaterThan(0);
  });

  it("expanded variant LANDING pane falls back to '—' when target_zone is null", () => {
    const lineup: Lineup = {
      ...BASE_LINEUP,
      target_zone: null as unknown as Lineup["target_zone"],
    };
    render(<LineupCard lineup={lineup} variant="expanded" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("expanded variant THROW pane shows ThrowPlaceholder when clip_url is null", () => {
    render(<LineupCard lineup={BASE_LINEUP} variant="expanded" />);
    expect(screen.getByText("No clip yet")).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
  });

  it("expanded variant THROW pane renders ClipView when clip_url is set", () => {
    const lineup: Lineup = { ...BASE_LINEUP, clip_url: "https://ex.com/clip.mp4" };
    render(<LineupCard lineup={lineup} variant="expanded" />);
    expect(document.querySelector("video")).not.toBeNull();
    // The ThrowPlaceholder copy must not appear when a clip is mounted.
    expect(screen.queryByText("No clip yet")).not.toBeInTheDocument();
  });

  it("expanded variant header surfaces technique when set", () => {
    const lineup: Lineup = { ...BASE_LINEUP, technique: "Jumpthrow + LMB" };
    render(<LineupCard lineup={lineup} variant="expanded" />);
    expect(screen.getByText(/Jumpthrow \+ LMB/)).toBeInTheDocument();
  });
});
