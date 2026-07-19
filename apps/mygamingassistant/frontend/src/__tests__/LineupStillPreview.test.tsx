/**
 * LineupStillPreview unit tests — the glance-board's always-visible,
 * no-motion 2-still summary body (STAND left | LANDING right) + the
 * MiniPosterThumb primitive reused by LineupListRow.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LineupStillPreview, { MiniPosterThumb } from "@/components/lineup/LineupStillPreview";
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

describe("LineupStillPreview", () => {
  it("renders STAND and LANDING stills with lazy-loading images", () => {
    render(<LineupStillPreview lineup={makeLineup()} />);
    const standImg = screen.getByAltText(/stand position/i) as HTMLImageElement;
    const landingImg = screen.getByAltText(/— landing$/i) as HTMLImageElement;
    expect(standImg.src).toBe("https://ex.com/stand.png");
    expect(standImg.getAttribute("loading")).toBe("lazy");
    expect(landingImg.src).toBe("https://ex.com/landing.png");
    expect(landingImg.getAttribute("loading")).toBe("lazy");
    expect(document.querySelector("video")).toBeNull();
  });

  it("STAND falls back to ScreenshotHalf's 'No screenshot' state when null", () => {
    render(<LineupStillPreview lineup={makeLineup({ stand_screenshot_url: null })} />);
    expect(screen.getByText("No screenshot")).toBeInTheDocument();
  });

  it("LANDING falls back to the 'Lands in: <zone>' text card when null", () => {
    render(
      <LineupStillPreview
        lineup={makeLineup({
          landing_screenshot_url: null,
          target_zone: { id: "z9", slug: "mid", name: "Mid", polygon_points: [] },
        })}
      />,
    );
    expect(screen.getByText("Lands in")).toBeInTheDocument();
    expect(screen.getByText("Mid")).toBeInTheDocument();
  });

  it("LANDING falls back to em-dash when zone is also null", () => {
    render(
      <LineupStillPreview
        lineup={makeLineup({ landing_screenshot_url: null, target_zone: null })}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("never falls back to aim_screenshot_url for the LANDING half", () => {
    render(
      <LineupStillPreview
        lineup={makeLineup({
          landing_screenshot_url: null,
          aim_screenshot_url: "https://ex.com/aim-only.png",
        })}
      />,
    );
    const imgs = Array.from(document.querySelectorAll("img")).map((i) => i.src);
    expect(imgs).not.toContain("https://ex.com/aim-only.png");
  });
});

describe("MiniPosterThumb", () => {
  it("renders an <img> when a URL is present, always aria-hidden", () => {
    render(<MiniPosterThumb url="https://ex.com/thumb.png" />);
    const img = document.querySelector("img") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toBe("https://ex.com/thumb.png");
    expect(img.getAttribute("aria-hidden")).not.toBeNull();
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("renders a muted ImageOff icon when url is null", () => {
    render(<MiniPosterThumb url={null} />);
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("svg")).not.toBeNull();
  });
});
