/**
 * GlanceBoardTile unit tests — preview-stills summary tile.
 *
 * jsdom implements neither IntersectionObserver nor HTMLMediaElement
 * play/pause; both are stubbed so the expanded-storyboard tests (which
 * mount GlanceBoardStoryboard's <video>-bearing panes) don't throw.
 *
 * Tests:
 * - Collapsed by default: renders STAND + LANDING stills only, no <video>
 *   anywhere, no AIM/THROW panes present.
 * - Header (util badge, title, side chip, "From: <zone>") + footer
 *   (setup_seconds/technique) render unconditionally, same as before.
 * - Knobs are completely ignored in the collapsed state — even a knobs
 *   object requesting clip mode for every pane must not mount a <video>
 *   while collapsed (the perf-regression guard from the design spec).
 * - Expand button reveals the full 4-pane storyboard below the summary;
 *   collapsing again unmounts it.
 * - No nested interactive elements: the expand button is the sole element
 *   owning aria-expanded / keyboard activation.
 * - LANDING fallback chain: real screenshot → "Lands in: <zone>" text →
 *   em-dash when the zone is also null. Never falls back to aim_screenshot_url.
 * - STAND null screenshot reuses ScreenshotHalf's "No screenshot" state.
 * - Side chip renders via the shared sideDisplay tokens.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlanceBoardTile from "@/components/lineup/GlanceBoardTile";
import type { Lineup } from "@/types/game";
import type { DesignKnobs } from "@/hooks/useDesignKnobs";

function makeLineup(over: Partial<Lineup> = {}): Lineup {
  return {
    id: "l1",
    game_id: "g1",
    map_id: "m1",
    target_zone_id: "z1",
    stand_zone_id: "z2",
    side: "side_a",
    utility_type_id: "u1",
    title: "B-site smoke from T spawn",
    notes: null,
    stand_screenshot_url: "https://ex.com/stand.png",
    aim_screenshot_url: "https://ex.com/aim.png",
    landing_screenshot_url: "https://ex.com/landing.png",
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

const ALL_CLIP_KNOBS: DesignKnobs = {
  standMode: "clip",
  aimMode: "clip",
  showAimDot: true,
  landingMode: "clip",
  tilesPerRow: 4,
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
  vi.restoreAllMocks();
});

describe("GlanceBoardTile — collapsed summary (default)", () => {
  it("renders only STAND + LANDING stills, no video, no AIM/THROW panes", () => {
    render(<GlanceBoardTile lineup={makeLineup()} />);
    expect(screen.getByText("STAND")).toBeInTheDocument();
    expect(screen.getByText("LANDING")).toBeInTheDocument();
    expect(screen.queryByText("AIM")).not.toBeInTheDocument();
    expect(screen.queryByText("THROW")).not.toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
  });

  it("renders the header (util badge, title, side chip, From: zone) unconditionally", () => {
    render(<GlanceBoardTile lineup={makeLineup()} />);
    expect(screen.getByText("SMOKE")).toBeInTheDocument();
    expect(screen.getByText("B-site smoke from T spawn")).toBeInTheDocument();
    expect(screen.getByText("T")).toBeInTheDocument();
    expect(screen.getByText("From: T Spawn")).toBeInTheDocument();
  });

  it("renders the footer (setup_seconds + technique) unconditionally", () => {
    render(<GlanceBoardTile lineup={makeLineup({ technique: "Jumpthrow + LMB" })} />);
    expect(screen.getByText("7s")).toBeInTheDocument();
    expect(screen.getByText("Jumpthrow + LMB")).toBeInTheDocument();
  });

  it("ignores knobs entirely while collapsed — no <video> even when every pane knob requests clip mode", () => {
    render(
      <GlanceBoardTile
        lineup={makeLineup({
          stand_clip_url: "https://ex.com/stand.mp4",
          aim_clip_url: "https://ex.com/aim.mp4",
          clip_url: "https://ex.com/throw.mp4",
          landing_clip_url: "https://ex.com/landing.mp4",
        })}
        knobs={ALL_CLIP_KNOBS}
      />,
    );
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByText("STAND")).toBeInTheDocument();
    expect(screen.getByText("LANDING")).toBeInTheDocument();
  });
});

describe("GlanceBoardTile — expand / collapse", () => {
  it("expand button reveals the full storyboard (AIM + THROW appear)", () => {
    render(<GlanceBoardTile lineup={makeLineup()} />);
    const button = screen.getByRole("button", { name: /expand/i });
    expect(button).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("AIM")).toBeInTheDocument();
    expect(screen.getByText("THROW")).toBeInTheDocument();
    // STAND/LANDING now render twice — once in the always-visible summary,
    // once in the expanded storyboard.
    expect(screen.getAllByText("STAND").length).toBe(2);
    expect(screen.getAllByText("LANDING").length).toBe(2);
  });

  it("collapses on second click — storyboard unmounts", () => {
    render(<GlanceBoardTile lineup={makeLineup()} />);
    const button = screen.getByRole("button", { name: /expand/i });
    fireEvent.click(button);
    expect(screen.getByText("AIM")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /collapse/i }));
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("AIM")).not.toBeInTheDocument();
    expect(screen.queryByText("THROW")).not.toBeInTheDocument();
  });

  it("clicking the always-visible summary area is a supplementary mouse toggle", () => {
    render(<GlanceBoardTile lineup={makeLineup()} />);
    fireEvent.click(screen.getByText("B-site smoke from T spawn"));
    expect(screen.getByRole("button", { name: /collapse/i })).toBeInTheDocument();
    expect(screen.getByText("AIM")).toBeInTheDocument();
  });

  it("exposes exactly one aria-expanded-owning control (no nested interactive elements)", () => {
    render(<GlanceBoardTile lineup={makeLineup()} />);
    const expandableButtons = screen
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-expanded"));
    expect(expandableButtons.length).toBe(1);
  });
});

describe("GlanceBoardTile — LANDING fallback chain", () => {
  it("renders the real landing screenshot when set", () => {
    render(
      <GlanceBoardTile
        lineup={makeLineup({ landing_screenshot_url: "https://ex.com/landing.png" })}
      />,
    );
    const img = screen.getByAltText(/— landing$/i) as HTMLImageElement;
    expect(img.src).toBe("https://ex.com/landing.png");
    expect(screen.queryByText("Lands in")).not.toBeInTheDocument();
  });

  it("falls back to 'Lands in: <zone>' text when landing_screenshot_url is null", () => {
    render(
      <GlanceBoardTile
        lineup={makeLineup({
          landing_screenshot_url: null,
          target_zone: { id: "z9", slug: "mid", name: "Mid", polygon_points: [] },
        })}
      />,
    );
    expect(screen.getByText("Lands in")).toBeInTheDocument();
    expect(screen.getByText("Mid")).toBeInTheDocument();
    expect(screen.queryByAltText(/— landing$/i)).not.toBeInTheDocument();
  });

  it("falls back to em-dash when both landing_screenshot_url and target_zone are null", () => {
    render(
      <GlanceBoardTile
        lineup={makeLineup({
          landing_screenshot_url: null,
          target_zone: null,
        })}
      />,
    );
    expect(screen.getByText("Lands in")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("does NOT fall back to aim_screenshot_url when landing_screenshot_url is null", () => {
    render(
      <GlanceBoardTile
        lineup={makeLineup({
          landing_screenshot_url: null,
          aim_screenshot_url: "https://ex.com/aim-only.png",
        })}
      />,
    );
    // The AIM still is not rendered in the collapsed summary at all, and
    // the LANDING half must be the text fallback, not the aim image.
    const imgs = Array.from(document.querySelectorAll("img")).map((i) => i.src);
    expect(imgs).not.toContain("https://ex.com/aim-only.png");
    expect(screen.getByText("Lands in")).toBeInTheDocument();
  });
});

describe("GlanceBoardTile — STAND null fallback", () => {
  it("reuses ScreenshotHalf's 'No screenshot' state when stand_screenshot_url is null", () => {
    render(<GlanceBoardTile lineup={makeLineup({ stand_screenshot_url: null })} />);
    expect(screen.getByText("No screenshot")).toBeInTheDocument();
    expect(screen.getByText("STAND")).toBeInTheDocument();
  });
});

describe("GlanceBoardTile — side chip via shared sideDisplay tokens", () => {
  it("side_a renders the gold token classes", () => {
    render(<GlanceBoardTile lineup={makeLineup({ side: "side_a" })} />);
    const chip = screen.getByText("T");
    expect(chip.className).toContain("bg-yellow-500/20");
  });

  it("side_b renders the blue token classes", () => {
    render(<GlanceBoardTile lineup={makeLineup({ side: "side_b" })} />);
    const chip = screen.getByText("CT");
    expect(chip.className).toContain("bg-blue-500/20");
  });

  it("any/null side renders 'Both'", () => {
    render(<GlanceBoardTile lineup={makeLineup({ side: null })} />);
    expect(screen.getByText("Both")).toBeInTheDocument();
  });
});

describe("GlanceBoardTile technique footer", () => {
  it("renders nothing for technique when null and keeps the setup clock", () => {
    render(<GlanceBoardTile lineup={makeLineup({ technique: null })} />);
    expect(
      screen.queryByLabelText(/^Throw technique:/),
    ).not.toBeInTheDocument();
    expect(screen.getByText("7s")).toBeInTheDocument();
  });

  it("truncates long technique via class + carries the full string in title=", () => {
    const long =
      "Valorant Killjoy alarmbot bounce-on-stair-corner three-quarter-charge";
    render(<GlanceBoardTile lineup={makeLineup({ technique: long })} />);
    const span = screen.getByLabelText(`Throw technique: ${long}`);
    expect(span.getAttribute("title")).toBe(long);
    expect(span.className).toContain("truncate");
  });
});
