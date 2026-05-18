/**
 * GlanceBoardTile unit tests (PR2 clip view).
 *
 * jsdom implements neither IntersectionObserver nor HTMLMediaElement
 * play/pause, so both are stubbed here (not globally — keeps blast radius
 * to this file).
 *
 * Tests:
 * - clip_url present → <video> rendered (poster=stand), stills NOT rendered
 * - clip_url null → falls back to the STAND/AIM stills, no <video>
 * - src is lazy: absent until the tile scrolls into view
 * - in view → play() called + src attached; out of view → pause() called
 * - IntersectionObserver missing → arms immediately (graceful degrade)
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
    utility_type: { id: "u1", slug: "smoke", name: "Smoke" },
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
let pauseSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  lastIO = null;
  vi.stubGlobal("IntersectionObserver", FakeIO as unknown as typeof IntersectionObserver);
  // jsdom doesn't implement play/pause — spy + no-op so the component's
  // best-effort calls don't throw.
  playSpy = vi
    .spyOn(window.HTMLMediaElement.prototype, "play")
    .mockResolvedValue(undefined);
  pauseSpy = vi
    .spyOn(window.HTMLMediaElement.prototype, "pause")
    .mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GlanceBoardTile clip view", () => {
  it("renders the stills fallback when clip_url is null", () => {
    render(<GlanceBoardTile lineup={makeLineup({ clip_url: null })} />);
    expect(screen.getByText("STAND")).toBeInTheDocument();
    expect(screen.getByText("AIM")).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
  });

  it("renders a <video> (poster=stand) and hides the stills when clip_url is set", () => {
    render(
      <GlanceBoardTile
        lineup={makeLineup({ clip_url: "https://ex.com/clip.mp4" })}
      />,
    );
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.getAttribute("poster")).toBe("https://ex.com/stand.png");
    expect(video.muted).toBe(true);
    expect(video.hasAttribute("loop")).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    // The split stills are not used when a clip exists.
    expect(screen.queryByText("STAND")).not.toBeInTheDocument();
    expect(screen.queryByText("AIM")).not.toBeInTheDocument();
  });

  it("lazily attaches src only after the tile scrolls into view", () => {
    render(
      <GlanceBoardTile
        lineup={makeLineup({ clip_url: "https://ex.com/clip.mp4" })}
      />,
    );
    const video = document.querySelector("video") as HTMLVideoElement;
    // Before any intersection: no src fetched.
    expect(video.getAttribute("src")).toBeNull();

    act(() => lastIO!.cb([{ isIntersecting: true }]));

    expect(video.getAttribute("src")).toBe("https://ex.com/clip.mp4");
    expect(playSpy).toHaveBeenCalled();
  });

  it("pauses when the tile leaves the viewport", () => {
    render(
      <GlanceBoardTile
        lineup={makeLineup({ clip_url: "https://ex.com/clip.mp4" })}
      />,
    );
    act(() => lastIO!.cb([{ isIntersecting: true }]));
    act(() => lastIO!.cb([{ isIntersecting: false }]));
    expect(pauseSpy).toHaveBeenCalled();
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
