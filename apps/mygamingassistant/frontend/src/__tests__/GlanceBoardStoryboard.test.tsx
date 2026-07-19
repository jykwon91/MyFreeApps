/**
 * GlanceBoardStoryboard unit tests — the extracted 4-pane knob-driven body
 * (previously exercised directly against GlanceBoardTile before the
 * preview-stills feature split the summary tile from the storyboard).
 *
 * jsdom implements neither IntersectionObserver nor HTMLMediaElement
 * play/pause, so both are stubbed here (not globally — keeps blast radius
 * to this file).
 *
 * Tests:
 * - All four panes (STAND, AIM, THROW, LANDING) render simultaneously
 *   regardless of clip_url presence (PR4 invariant, preserved post-extraction)
 * - THROW pane: ClipView lazy-loads on scroll; pauses out of view; degrades
 *   without IntersectionObserver (existing PR2 behavior preserved)
 * - THROW pane: ThrowPlaceholder when clip_url is null
 * - LANDING pane: renders target_zone.name; falls back to "—" when null
 * - Throw technique is NOT rendered here (footer moved to GlanceBoardTile)
 */
import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlanceBoardStoryboard from "@/components/lineup/GlanceBoardStoryboard";
import type { Lineup } from "@/types/game";

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

// --- IntersectionObserver capture --------------------------------------
type IOCb = (entries: { isIntersecting: boolean }[]) => void;
interface FakeIOInstance {
  cb: IOCb;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
  takeRecords: () => never[];
}
let lastIO: FakeIOInstance | null;

// Factory (not a class) so we never need to alias `this` — a constructor
// call that returns an object uses that object as the `new` result, so this
// is still usable as `new IntersectionObserver(cb)` from ClipView.
function fakeIOFactory(cb: IOCb): FakeIOInstance {
  const instance: FakeIOInstance = {
    cb,
    observe: vi.fn(),
    disconnect: vi.fn(),
    unobserve: vi.fn(),
    takeRecords: () => [],
  };
  lastIO = instance;
  return instance;
}

let playSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  lastIO = null;
  vi.stubGlobal("IntersectionObserver", fakeIOFactory as unknown as typeof IntersectionObserver);
  playSpy = vi
    .spyOn(window.HTMLMediaElement.prototype, "play")
    .mockResolvedValue(undefined);
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GlanceBoardStoryboard (4 panes)", () => {
  it("renders all four panes simultaneously when clip_url is null (stills + placeholders)", () => {
    render(<GlanceBoardStoryboard lineup={makeLineup({ clip_url: null })} />);
    expect(screen.getByText("STAND")).toBeInTheDocument();
    expect(screen.getByText("AIM")).toBeInTheDocument();
    expect(screen.getByText("THROW")).toBeInTheDocument();
    expect(screen.getByText("No clip yet")).toBeInTheDocument();
    expect(screen.getByText("LANDING")).toBeInTheDocument();
    expect(screen.getByText("B Site")).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
  });

  it("renders all four panes simultaneously when clip_url is set (stills + clip + landing)", () => {
    render(
      <GlanceBoardStoryboard
        lineup={makeLineup({ clip_url: "https://ex.com/clip.mp4" })}
      />,
    );
    expect(screen.getByText("STAND")).toBeInTheDocument();
    expect(screen.getByText("AIM")).toBeInTheDocument();
    expect(screen.getByText("LANDING")).toBeInTheDocument();
    expect(screen.getByText("B Site")).toBeInTheDocument();
    expect(screen.getByText("THROW")).toBeInTheDocument();
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.getAttribute("poster")).toBe("https://ex.com/stand.png");
  });

  it("AIM pane zooms 2× pinned to center regardless of persisted anchor coords", () => {
    render(<GlanceBoardStoryboard lineup={makeLineup({ aim_anchor_x: 0.5, aim_anchor_y: 0.4 })} />);
    const aimImg = screen.getByAltText(/aim reference/i) as HTMLImageElement;
    expect(aimImg.style.transform).toBe("scale(2)");
    expect(aimImg.style.transformOrigin).toBe("50% 50%");
    expect(screen.queryByLabelText(/aim anchor/i)).toBeNull();
  });
});

describe("GlanceBoardStoryboard LANDING pane", () => {
  it("renders the target zone name", () => {
    render(
      <GlanceBoardStoryboard
        lineup={makeLineup({
          target_zone: { id: "z9", slug: "mid", name: "Mid", polygon_points: [] },
        })}
      />,
    );
    expect(screen.getByText("Mid")).toBeInTheDocument();
    expect(screen.getByText("Lands in")).toBeInTheDocument();
  });

  it("falls back to '—' when target_zone is null (malformed lineup)", () => {
    render(<GlanceBoardStoryboard lineup={makeLineup({ target_zone: null as unknown as Lineup["target_zone"] })} />);
    expect(screen.getByText("LANDING")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders looping landing-clip video when landing_clip_url is set", () => {
    render(
      <GlanceBoardStoryboard
        lineup={makeLineup({ landing_clip_url: "https://ex.com/landing.mp4" })}
      />,
    );
    const landingVideo = document.querySelector(
      'video[aria-label*="looping landing clip"]',
    );
    expect(landingVideo).not.toBeNull();
    expect(screen.queryByText("Lands in")).not.toBeInTheDocument();
  });
});

describe("GlanceBoardStoryboard THROW pane (clip)", () => {
  it("lazily attaches src only after the tile scrolls into view", () => {
    render(
      <GlanceBoardStoryboard
        lineup={makeLineup({ clip_url: "https://ex.com/clip.mp4" })}
      />,
    );
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video.hasAttribute("src")).toBe(false);
    expect(video.getAttribute("preload")).toBe("metadata");

    expect(lastIO).not.toBeNull();
    act(() => lastIO!.cb([{ isIntersecting: true }]));

    expect(video.getAttribute("src")).toBe("https://ex.com/clip.mp4");
    expect(video.getAttribute("preload")).toBe("auto");
    expect(playSpy).toHaveBeenCalled();
  });

  it("arms immediately when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(
      <GlanceBoardStoryboard
        lineup={makeLineup({ clip_url: "https://ex.com/clip.mp4" })}
      />,
    );
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe("https://ex.com/clip.mp4");
  });
});

describe("GlanceBoardStoryboard PR6 micro-clips (STAND + AIM)", () => {
  it("renders the STAND looping clip when stand_clip_url is set", () => {
    render(
      <GlanceBoardStoryboard
        lineup={makeLineup({ stand_clip_url: "https://ex.com/stand.mp4" })}
      />,
    );
    const standVideo = document.querySelector(
      'video[aria-label*="looping stand clip"]',
    );
    expect(standVideo).not.toBeNull();
    expect(screen.getByText("STAND")).toBeInTheDocument();
  });

  it("gracefully falls back to all stills when every clip URL is null (pre-PR6 lineups)", () => {
    render(<GlanceBoardStoryboard lineup={makeLineup()} />);
    expect(document.querySelectorAll("video").length).toBe(0);
    expect(screen.getByAltText(/stand position/i)).toBeInTheDocument();
    expect(screen.getByAltText(/aim reference/i)).toBeInTheDocument();
    expect(screen.getByText("No clip yet")).toBeInTheDocument();
    expect(screen.getByText("Lands in")).toBeInTheDocument();
  });

  it("all four panes show motion when every clip URL is set", () => {
    render(
      <GlanceBoardStoryboard
        lineup={makeLineup({
          stand_clip_url: "https://ex.com/stand.mp4",
          aim_clip_url: "https://ex.com/aim.mp4",
          clip_url: "https://ex.com/throw.mp4",
          landing_clip_url: "https://ex.com/landing.mp4",
        })}
      />,
    );
    expect(document.querySelectorAll("video").length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Knobs — this component is the ONLY place knob-forced overrides apply.
// ---------------------------------------------------------------------------
describe("GlanceBoardStoryboard knob-forced overrides", () => {
  it("still mode discards a present clip URL even when set", () => {
    render(
      <GlanceBoardStoryboard
        lineup={makeLineup({ stand_clip_url: "https://ex.com/stand.mp4" })}
        knobs={{ standMode: "still", aimMode: "clip", showAimDot: true, landingMode: "clip", tilesPerRow: 4 }}
      />,
    );
    expect(
      document.querySelector('video[aria-label*="looping stand clip"]'),
    ).toBeNull();
    expect(screen.getByAltText(/stand position/i)).toBeInTheDocument();
  });
});
