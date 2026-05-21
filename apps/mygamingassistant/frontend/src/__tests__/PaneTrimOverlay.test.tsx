/**
 * PaneTrimOverlay unit tests — PR2 per-pane clip-duration trim.
 *
 * Two collaborators are mocked at module level rather than going through the
 * real RTK Query / HTMLVideoElement plumbing:
 *
 *   - ``useClipDuration``: jsdom doesn't fire ``loadedmetadata`` on a detached
 *     <video>, so we'd have to fake the entire HTMLMediaElement surface to get
 *     a non-null duration. Mocking the hook is the same shape as the existing
 *     ``GlanceBoardTile.test.tsx`` IntersectionObserver-stub pattern.
 *
 *   - ``useTrimPaneMutation``: lets us control the trim promise so the
 *     applying-state assertion can lock the component in that phase, and the
 *     error path can exercise extractError without an HTTP round-trip.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useClipDuration", () => ({
  useClipDuration: vi.fn(),
}));

const unwrap = vi.fn();
const trimPaneMutation = vi.fn(() => ({ unwrap }));
vi.mock("@/store/lineupsApi", () => ({
  useTrimPaneMutation: () => [trimPaneMutation, {}],
}));

import { useClipDuration } from "@/hooks/useClipDuration";
import PaneTrimOverlay from "@/components/lineup/PaneTrimOverlay";

const mockedUseClipDuration = vi.mocked(useClipDuration);

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom doesn't implement HTMLMediaElement play/pause — stub so the PR3
  // preview <video> inside TrimSliderPanel doesn't warn or throw. Same
  // pattern as GlanceBoardTile.test.tsx.
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(
    undefined,
  );
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(
    () => {},
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PaneTrimOverlay", () => {
  // -------------------------------------------------------------------------
  // Idle / suppression behaviour
  // -------------------------------------------------------------------------

  it("renders nothing when clipUrl is null (no clip → no trim affordance)", () => {
    mockedUseClipDuration.mockReturnValue(null);
    const { container } = render(
      <PaneTrimOverlay lineupId="l1" pane="throw" clipUrl={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("scissor button is disabled when clipDurationS is still unknown (probe loading)", () => {
    mockedUseClipDuration.mockReturnValue(null);
    render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="throw"
        clipUrl="https://ex/clip.mp4"
      />,
    );
    const btn = screen.getByRole("button", {
      name: /trim throw clip duration/i,
    });
    expect(btn).toBeDisabled();
  });

  it("scissor button is enabled once the duration probe resolves", () => {
    mockedUseClipDuration.mockReturnValue(5);
    render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="landing"
        clipUrl="https://ex/clip.mp4"
      />,
    );
    const btn = screen.getByRole("button", {
      name: /trim landing clip duration/i,
    });
    expect(btn).not.toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // Open / slider behaviour
  // -------------------------------------------------------------------------

  it("opens the slider panel on scissor click and exposes role=slider with aria-valuenow on both thumbs", () => {
    mockedUseClipDuration.mockReturnValue(5);
    render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="throw"
        clipUrl="https://ex/clip.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /trim throw clip duration/i }),
    );

    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(2);
    // Default range covers the full clip.
    expect(sliders[0]).toHaveAttribute("aria-valuenow", "0");
    expect(sliders[1]).toHaveAttribute("aria-valuenow", "5");
    expect(sliders[0]).toHaveAttribute("aria-valuemax", "5");
    expect(sliders[1]).toHaveAttribute("aria-valuemax", "5");
  });

  it("mounts a muted aria-hidden preview <video> with the clip URL when the panel opens (PR3)", () => {
    mockedUseClipDuration.mockReturnValue(5);
    const { container } = render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="throw"
        clipUrl="https://ex/clip.mp4"
      />,
    );
    // Closed → no preview video.
    expect(container.querySelector("video")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /trim throw clip duration/i }),
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.getAttribute("src")).toBe("https://ex/clip.mp4");
    expect(video.muted).toBe(true);
    expect(video.getAttribute("aria-hidden")).toBe("true");
  });

  it("Apply button is disabled when initial range is shorter than MIN_TRIM_DURATION_S", () => {
    mockedUseClipDuration.mockReturnValue(0.5);
    render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="throw"
        clipUrl="https://ex/clip.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /trim throw clip duration/i }),
    );

    const apply = screen.getByRole("button", {
      name: /trim clip \(minimum 1s\)/i,
    });
    expect(apply).toBeDisabled();
  });

  it("Apply button is enabled when range >= MIN_TRIM_DURATION_S", () => {
    mockedUseClipDuration.mockReturnValue(5);
    render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="throw"
        clipUrl="https://ex/clip.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /trim throw clip duration/i }),
    );

    const apply = screen.getByRole("button", { name: /^Trim clip$/i });
    expect(apply).not.toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // Escape handling
  // -------------------------------------------------------------------------

  it("Escape closes the open slider", () => {
    mockedUseClipDuration.mockReturnValue(5);
    render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="throw"
        clipUrl="https://ex/clip.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /trim throw clip duration/i }),
    );
    expect(screen.getAllByRole("slider")).toHaveLength(2);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    // Scissor visible again.
    expect(
      screen.getByRole("button", { name: /trim throw clip duration/i }),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Applying state
  // -------------------------------------------------------------------------

  it("applying state renders a role=status with aria-live=polite while the trim is in flight", async () => {
    mockedUseClipDuration.mockReturnValue(5);
    // Lock the trim in flight so the component stays in "applying".
    unwrap.mockReturnValue(new Promise(() => {}));

    render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="throw"
        clipUrl="https://ex/clip.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /trim throw clip duration/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Trim clip$/i }));

    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status.getAttribute("aria-label")).toMatch(/trimming throw clip/i);
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  it("renders the server error message + Retry on a trim failure", async () => {
    mockedUseClipDuration.mockReturnValue(5);
    unwrap.mockRejectedValueOnce({ data: { detail: "ffmpeg explosion" } });

    render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="throw"
        clipUrl="https://ex/clip.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /trim throw clip duration/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Trim clip$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/ffmpeg explosion/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retry trim on throw clip/i }),
    ).toBeInTheDocument();
  });

  it("Cancel from the error state returns to the idle scissor button", async () => {
    mockedUseClipDuration.mockReturnValue(5);
    unwrap.mockRejectedValueOnce({ data: { detail: "boom" } });

    render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="throw"
        clipUrl="https://ex/clip.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /trim throw clip duration/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Trim clip$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /cancel trim/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /trim throw clip duration/i }),
    ).toBeInTheDocument();
  });
});
