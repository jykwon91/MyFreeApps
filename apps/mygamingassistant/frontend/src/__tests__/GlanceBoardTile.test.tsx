/**
 * GlanceBoardTile unit tests — PR4 4-pane storyboard.
 *
 * jsdom implements neither IntersectionObserver nor HTMLMediaElement
 * play/pause, so both are stubbed here (not globally — keeps blast radius
 * to this file).
 *
 * Tests:
 * - All four panes (STAND, AIM, THROW, LANDING) render simultaneously
 *   regardless of clip_url presence (PR4 invariant)
 * - THROW pane: ClipView lazy-loads on scroll; pauses out of view; degrades
 *   without IntersectionObserver (existing PR2 behavior preserved)
 * - THROW pane: ThrowPlaceholder when clip_url is null
 * - LANDING pane: renders target_zone.name; falls back to "—" when null
 * - Throw technique footer (PR3 behavior preserved)
 */
import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlanceBoardTile from "@/components/lineup/GlanceBoardTile";
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
let lastIO: { cb: IOCb; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> } | null;

class FakeIO {
  cb: IOCb;
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(cb: IOCb) {
    this.cb = cb;
    lastIO = this;
  }
  takeRecords() {
    return [];
  }
  unobserve = vi.fn();
}

let playSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  lastIO = null;
  vi.stubGlobal("IntersectionObserver", FakeIO as unknown as typeof IntersectionObserver);
  // jsdom doesn't implement play/pause — spy + no-op so the component's
  // best-effort calls don't throw.
  playSpy = vi
    .spyOn(window.HTMLMediaElement.prototype, "play")
    .mockResolvedValue(undefined);
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 4-pane storyboard — the PR4 invariant
// ---------------------------------------------------------------------------
describe("GlanceBoardTile storyboard (4 panes)", () => {
  it("renders all four panes simultaneously when clip_url is null (stills + placeholders)", () => {
    render(<GlanceBoardTile lineup={makeLineup({ clip_url: null })} />);
    expect(screen.getByText("STAND")).toBeInTheDocument();
    expect(screen.getByText("AIM")).toBeInTheDocument();
    // THROW pane shows the placeholder badge + "No clip yet" message.
    expect(screen.getByText("THROW")).toBeInTheDocument();
    expect(screen.getByText("No clip yet")).toBeInTheDocument();
    expect(screen.getByText("LANDING")).toBeInTheDocument();
    expect(screen.getByText("B Site")).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
  });

  it("renders all four panes simultaneously when clip_url is set (stills + clip + landing)", () => {
    render(
      <GlanceBoardTile
        lineup={makeLineup({ clip_url: "https://ex.com/clip.mp4" })}
      />,
    );
    // The stills must still render — PR4 reverses PR2's clip-replaces-stills.
    expect(screen.getByText("STAND")).toBeInTheDocument();
    expect(screen.getByText("AIM")).toBeInTheDocument();
    expect(screen.getByText("LANDING")).toBeInTheDocument();
    expect(screen.getByText("B Site")).toBeInTheDocument();
    // THROW pane now hosts the clip.
    expect(screen.getByText("THROW")).toBeInTheDocument();
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.getAttribute("poster")).toBe("https://ex.com/stand.png");
  });

  it("AIM pane zooms 2× pinned to center regardless of persisted anchor coords", () => {
    // Post-2026-05-23: anchor coords are ignored at render time — AIM_TS now
    // derives from the throw-localizer's release_ts (not the grid frame the
    // anchor was computed against), so trusting the coords would re-introduce
    // drift. Crosshair in FPS is always at screen center, so origin is
    // hardcoded to (50%, 50%).
    render(<GlanceBoardTile lineup={makeLineup({ aim_anchor_x: 0.5, aim_anchor_y: 0.4 })} />);
    const aimImg = screen.getByAltText(/aim reference/i) as HTMLImageElement;
    expect(aimImg.style.transform).toBe("scale(2)");
    expect(aimImg.style.transformOrigin).toBe("50% 50%");
    // The red dot is gone — the zoomed crop is the affordance now.
    expect(screen.queryByLabelText(/aim anchor/i)).toBeNull();
  });

  it("AIM pane keeps the center origin even with null anchor coords", () => {
    render(
      <GlanceBoardTile
        lineup={makeLineup({ aim_anchor_x: null, aim_anchor_y: null })}
      />,
    );
    const aimImg = screen.getByAltText(/aim reference/i) as HTMLImageElement;
    expect(aimImg.style.transform).toBe("scale(2)");
    expect(aimImg.style.transformOrigin).toBe("50% 50%");
  });
});

// ---------------------------------------------------------------------------
// LANDING pane behavior
// ---------------------------------------------------------------------------
describe("GlanceBoardTile LANDING pane", () => {
  it("renders the target zone name", () => {
    render(
      <GlanceBoardTile
        lineup={makeLineup({
          target_zone: { id: "z9", slug: "mid", name: "Mid", polygon_points: [] },
        })}
      />,
    );
    expect(screen.getByText("Mid")).toBeInTheDocument();
    expect(screen.getByText("Lands in")).toBeInTheDocument();
  });

  it("falls back to '—' when target_zone is null (malformed lineup)", () => {
    render(<GlanceBoardTile lineup={makeLineup({ target_zone: null as unknown as Lineup["target_zone"] })} />);
    expect(screen.getByText("LANDING")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  // PR5 — landing clip lights up the LANDING pane via the shared ClipView
  // primitive when landing_clip_url is set.

  it("PR5: renders looping landing-clip video when landing_clip_url is set", () => {
    render(
      <GlanceBoardTile
        lineup={makeLineup({
          landing_clip_url: "https://ex.com/landing.mp4",
        })}
      />,
    );
    const landingVideo = document.querySelector(
      'video[aria-label*="looping landing clip"]',
    );
    expect(landingVideo).not.toBeNull();
    // The text fallback ("Lands in") must NOT render once the clip is
    // mounted — showing both would be confusing UX.
    expect(screen.queryByText("Lands in")).not.toBeInTheDocument();
  });

  it("PR5: keeps text fallback when landing_clip_url is null", () => {
    render(<GlanceBoardTile lineup={makeLineup({ landing_clip_url: null })} />);
    expect(screen.getByText("Lands in")).toBeInTheDocument();
    expect(
      document.querySelector('video[aria-label*="looping landing clip"]'),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// THROW pane clip behavior (PR2 — preserved in the new bottom-left pane)
// ---------------------------------------------------------------------------
describe("GlanceBoardTile THROW pane (clip)", () => {
  it("lazily attaches src only after the tile scrolls into view", () => {
    render(
      <GlanceBoardTile
        lineup={makeLineup({ clip_url: "https://ex.com/clip.mp4" })}
      />,
    );
    const video = document.querySelector("video") as HTMLVideoElement;
    // Before any intersection: the attribute is absent (not src="").
    expect(video.hasAttribute("src")).toBe(false);
    expect(video.getAttribute("preload")).toBe("metadata");

    expect(lastIO).not.toBeNull();
    act(() => lastIO!.cb([{ isIntersecting: true }]));

    expect(video.getAttribute("src")).toBe("https://ex.com/clip.mp4");
    expect(video.getAttribute("preload")).toBe("auto");
    expect(playSpy).toHaveBeenCalled();
  });

  it("stops playback when the tile leaves the viewport (via src detach)", () => {
    // Post-perf-fix: scroll-out disarms the tile (armed=false), which causes
    // <video> to re-render without a src attribute. The browser stops
    // playback as a side effect of src removal — we no longer call pause()
    // explicitly because the play/pause effect early-returns when !armed.
    // The detached src is the assertion that matters; explicit pause was an
    // implementation detail of the previous sticky-arm design.
    render(
      <GlanceBoardTile
        lineup={makeLineup({ clip_url: "https://ex.com/clip.mp4" })}
      />,
    );
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(lastIO).not.toBeNull();
    act(() => lastIO!.cb([{ isIntersecting: true }]));
    expect(video.getAttribute("src")).toBe("https://ex.com/clip.mp4");
    act(() => lastIO!.cb([{ isIntersecting: false }]));
    expect(video.hasAttribute("src")).toBe(false);
  });

  it("detaches src on scroll-out so the browser can release decoded frames", () => {
    // Perf fix: sticky-arm was costing us — a glance board with 60+ lineups
    // (4 video tags each) accumulates decoded frames in GPU memory and
    // exhausts browser per-origin connection slots. After this fix the src
    // attribute is removed when the tile leaves the viewport, dropping the
    // <video> back to its lazy state for the next scroll-in.
    render(
      <GlanceBoardTile
        lineup={makeLineup({ clip_url: "https://ex.com/clip.mp4" })}
      />,
    );
    const video = document.querySelector("video") as HTMLVideoElement;
    act(() => lastIO!.cb([{ isIntersecting: true }]));
    expect(video.getAttribute("src")).toBe("https://ex.com/clip.mp4");
    expect(video.getAttribute("preload")).toBe("auto");

    act(() => lastIO!.cb([{ isIntersecting: false }]));
    // src attribute removed (not src="") AND preload reverted to "metadata"
    // — same posture as before the tile was ever armed.
    expect(video.hasAttribute("src")).toBe(false);
    expect(video.getAttribute("preload")).toBe("metadata");
  });

  it("hides the THROW badge when the clip fails to load", () => {
    render(
      <GlanceBoardTile
        lineup={makeLineup({ clip_url: "https://ex.com/gone.mp4" })}
      />,
    );
    expect(screen.getByText("THROW")).toBeInTheDocument();
    const video = document.querySelector("video") as HTMLVideoElement;
    act(() => video.dispatchEvent(new Event("error")));
    // The clip pane's overlay label is hidden so the poster (stand still)
    // stays as the graceful fallback rather than reading as broken.
    expect(screen.queryByText("THROW")).not.toBeInTheDocument();
  });

  it("arms immediately when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(
      <GlanceBoardTile
        lineup={makeLineup({ clip_url: "https://ex.com/clip.mp4" })}
      />,
    );
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe("https://ex.com/clip.mp4");
  });
});

// ---------------------------------------------------------------------------
// PR6 — STAND + AIM panes swap stills for 1s micro-clips
// ---------------------------------------------------------------------------
describe("GlanceBoardTile PR6 micro-clips (STAND + AIM)", () => {
  it("renders the STAND looping clip when stand_clip_url is set", () => {
    render(
      <GlanceBoardTile
        lineup={makeLineup({ stand_clip_url: "https://ex.com/stand.mp4" })}
      />,
    );
    const standVideo = document.querySelector(
      'video[aria-label*="looping stand clip"]',
    );
    expect(standVideo).not.toBeNull();
    // The STAND label still shows on the clip pane.
    expect(screen.getByText("STAND")).toBeInTheDocument();
  });

  it("keeps the STAND still when stand_clip_url is null", () => {
    render(<GlanceBoardTile lineup={makeLineup({ stand_clip_url: null })} />);
    // The stand still is the graceful fallback — no stand-clip <video>.
    expect(
      document.querySelector('video[aria-label*="looping stand clip"]'),
    ).toBeNull();
    expect(
      screen.getByAltText(/stand position/i),
    ).toBeInTheDocument();
  });

  it("renders the AIM looping clip when aim_clip_url is set", () => {
    render(
      <GlanceBoardTile
        lineup={makeLineup({ aim_clip_url: "https://ex.com/aim.mp4" })}
      />,
    );
    const aimVideo = document.querySelector(
      'video[aria-label*="looping aim clip"]',
    );
    expect(aimVideo).not.toBeNull();
  });

  it("AIM clip variant carries the same center-pinned 2× zoom as the still", () => {
    // Both still and clip apply scale(2) at (50%, 50%). The AIM clip is now
    // anchored on release_ts - 0.8s (throw-localizer), not the grid's aim
    // frame, so trusting the persisted aim_anchor for zoom origin would
    // introduce drift. Center-pin is the correct invariant.
    render(
      <GlanceBoardTile
        lineup={makeLineup({
          aim_clip_url: "https://ex.com/aim.mp4",
          aim_anchor_x: 0.5,
          aim_anchor_y: 0.4,
        })}
      />,
    );
    const aimVideo = document.querySelector(
      'video[aria-label*="looping aim clip"]',
    ) as HTMLVideoElement;
    expect(aimVideo).not.toBeNull();
    expect(aimVideo.style.transform).toBe("scale(2)");
    expect(aimVideo.style.transformOrigin).toBe("50% 50%");
    expect(screen.queryByLabelText(/aim anchor/i)).toBeNull();
  });

  it("all four panes show motion when every clip URL is set", () => {
    render(
      <GlanceBoardTile
        lineup={makeLineup({
          stand_clip_url: "https://ex.com/stand.mp4",
          aim_clip_url: "https://ex.com/aim.mp4",
          clip_url: "https://ex.com/throw.mp4",
          landing_clip_url: "https://ex.com/landing.mp4",
        })}
      />,
    );
    // Four <video> elements — one per pane — all simultaneously rendered.
    expect(document.querySelectorAll("video").length).toBe(4);
    // The four corner labels still render on the clip panes.
    expect(screen.getByText("STAND")).toBeInTheDocument();
    expect(screen.getByText("AIM")).toBeInTheDocument();
    expect(screen.getByText("THROW")).toBeInTheDocument();
    expect(screen.getByText("LANDING")).toBeInTheDocument();
  });

  it("gracefully falls back to all stills when every clip URL is null (pre-PR6 lineups)", () => {
    render(<GlanceBoardTile lineup={makeLineup()} />);
    // No video elements anywhere — both stills + ThrowPlaceholder + landing text.
    expect(document.querySelectorAll("video").length).toBe(0);
    expect(screen.getByAltText(/stand position/i)).toBeInTheDocument();
    expect(screen.getByAltText(/aim reference/i)).toBeInTheDocument();
    expect(screen.getByText("No clip yet")).toBeInTheDocument();
    expect(screen.getByText("Lands in")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// PR3 — throw-technique footer (preserved)
// ---------------------------------------------------------------------------
describe("GlanceBoardTile technique footer", () => {
  it("renders the technique string with the correct aria-label when set", () => {
    render(
      <GlanceBoardTile lineup={makeLineup({ technique: "Jumpthrow + LMB" })} />,
    );
    expect(screen.getByText("Jumpthrow + LMB")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Throw technique: Jumpthrow + LMB"),
    ).toBeInTheDocument();
  });

  it("renders nothing for technique when null and keeps the setup clock", () => {
    render(<GlanceBoardTile lineup={makeLineup({ technique: null })} />);
    // The placeholder em-dash from the pre-PR3 mockup must NOT appear — both
    // design agents agreed null renders nothing (no misleading affordance).
    expect(screen.queryByText("— technique —")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/^Throw technique:/),
    ).not.toBeInTheDocument();
    // Clock still renders so the footer isn't visually empty.
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
