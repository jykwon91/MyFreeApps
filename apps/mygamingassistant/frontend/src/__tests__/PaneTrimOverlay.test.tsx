/**
 * PaneTrimOverlay unit tests.
 *
 * Three collaborators are mocked at module level rather than going through
 * the real RTK Query / HTMLVideoElement plumbing:
 *
 *   - ``useClipDuration``: jsdom doesn't fire ``loadedmetadata`` on a detached
 *     <video>, so we'd have to fake the entire HTMLMediaElement surface to get
 *     a non-null duration. Mocking the hook is the same shape as the existing
 *     ``GlanceBoardTile.test.tsx`` IntersectionObserver-stub pattern.
 *
 *   - ``useTrimPaneMutation``: lets us control the trim promise so the
 *     applying-state assertion can lock the component in that phase, and the
 *     error path can exercise extractError without an HTTP round-trip.
 *
 *   - ``useLazyGetLineupAdminQuery`` (PR4): the overlay lazy-loads the admin
 *     payload on scissors click so it can bound the slider on the source clip
 *     and pre-fill thumbs from the stored trim offsets. The mock surfaces the
 *     fetched payload + a fetching flag so the spinner / open transition can
 *     be exercised deterministically.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useClipDuration", () => ({
  useClipDuration: vi.fn(),
}));

const unwrap = vi.fn();
const trimPaneMutation = vi.fn(() => ({ unwrap }));

const triggerAdmin = vi.fn();
// Mutable so individual tests can swap in cached / fetching / errored shapes
// without rebuilding the entire module mock.
let adminQueryResult: {
  data: Record<string, unknown> | undefined;
  isFetching: boolean;
  isSuccess: boolean;
  originalArgs: string | undefined;
};

vi.mock("@/store/lineupsApi", () => ({
  useTrimPaneMutation: () => [trimPaneMutation, {}],
  useLazyGetLineupAdminQuery: () => [triggerAdmin, adminQueryResult],
}));

import { useClipDuration } from "@/hooks/useClipDuration";
import PaneTrimOverlay from "@/components/lineup/PaneTrimOverlay";

const mockedUseClipDuration = vi.mocked(useClipDuration);

/** Build an admin-shape Lineup payload sufficient for the resolveSourceUrl /
 *  resolveStoredOffsets helpers. Defaults: untrimmed source on both panes. */
function makeAdminLineup(
  overrides: Partial<{
    clip_url_original: string | null;
    landing_clip_url_original: string | null;
    clip_trim_start_s: number | null;
    clip_trim_end_s: number | null;
    landing_clip_trim_start_s: number | null;
    landing_clip_trim_end_s: number | null;
  }> = {},
): Record<string, unknown> {
  return {
    id: "l1",
    clip_url_original: "https://ex/source-throw.mp4",
    landing_clip_url_original: "https://ex/source-landing.mp4",
    clip_trim_start_s: null,
    clip_trim_end_s: null,
    landing_clip_trim_start_s: null,
    landing_clip_trim_end_s: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default admin result: no fetch yet (operator hasn't clicked scissors).
  adminQueryResult = {
    data: undefined,
    isFetching: false,
    isSuccess: false,
    originalArgs: undefined,
  };
  // jsdom doesn't implement HTMLMediaElement play/pause — stub so the
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

  it("scissors visible (clickable) before the operator interacts — no fetch fires until click", () => {
    mockedUseClipDuration.mockReturnValue(null);
    render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="throw"
        clipUrl="https://ex/clip.mp4"
      />,
    );
    // Lazy admin query must NOT have been triggered on render — only on
    // the first scissors click.
    expect(triggerAdmin).not.toHaveBeenCalled();
    const btn = screen.getByRole("button", {
      name: /trim throw clip duration/i,
    });
    expect(btn).not.toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // Lazy admin fetch on scissors click
  // -------------------------------------------------------------------------

  it("triggers the admin fetch with the lineup id on scissors click", () => {
    mockedUseClipDuration.mockReturnValue(null);
    render(
      <PaneTrimOverlay
        lineupId="lineup-xyz"
        pane="throw"
        clipUrl="https://ex/clip.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /trim throw clip duration/i }),
    );
    expect(triggerAdmin).toHaveBeenCalledWith("lineup-xyz", true);
  });

  it("shows a spinner while the admin fetch is in flight after the operator clicks scissors", () => {
    mockedUseClipDuration.mockReturnValue(null);
    // Simulate the in-flight state RTK Query would surface mid-fetch.
    adminQueryResult = {
      data: undefined,
      isFetching: true,
      isSuccess: false,
      originalArgs: "l1",
    };
    const { container } = render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="throw"
        clipUrl="https://ex/clip.mp4"
      />,
    );
    // Click sets awaitingOpenRef and renders the spinner branch.
    fireEvent.click(
      screen.getByRole("button", { name: /trim throw clip duration/i }),
    );
    // Spinner element (Loader2 from lucide) is svg.animate-spin.
    expect(container.querySelector("svg.animate-spin")).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Open / slider behaviour
  // -------------------------------------------------------------------------

  it("opens the slider with bounds = SOURCE duration and thumbs at [0, sourceDuration] when no offsets are stored", () => {
    mockedUseClipDuration.mockReturnValue(12); // source duration
    adminQueryResult = {
      data: makeAdminLineup(),
      isFetching: false,
      isSuccess: true,
      originalArgs: "l1",
    };
    render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="throw"
        clipUrl="https://ex/current-trim.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /trim throw clip duration/i }),
    );

    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(2);
    // Untrimmed → thumbs at [0, sourceDuration]. The slider's upper bound
    // is the SOURCE duration (12), not the currently-served clip's
    // duration.
    expect(sliders[0]).toHaveAttribute("aria-valuenow", "0");
    expect(sliders[1]).toHaveAttribute("aria-valuenow", "12");
    expect(sliders[0]).toHaveAttribute("aria-valuemax", "12");
    expect(sliders[1]).toHaveAttribute("aria-valuemax", "12");
  });

  it("pre-fills thumbs to the stored trim offsets when the lineup has been previously trimmed", () => {
    mockedUseClipDuration.mockReturnValue(12); // source duration
    adminQueryResult = {
      data: makeAdminLineup({
        clip_trim_start_s: 2.5,
        clip_trim_end_s: 4.5,
      }),
      isFetching: false,
      isSuccess: true,
      originalArgs: "l1",
    };
    render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="throw"
        clipUrl="https://ex/current-trim.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /trim throw clip duration/i }),
    );

    const sliders = screen.getAllByRole("slider");
    // Thumbs reflect the operator's "where am I currently" inside the
    // source — the PR4 promise that PR2 could not deliver.
    expect(sliders[0]).toHaveAttribute("aria-valuenow", "2.5");
    expect(sliders[1]).toHaveAttribute("aria-valuenow", "4.5");
    // Slider's upper bound is still the source duration — so the operator
    // can drag the end thumb OUTWARD from 4.5 to up to 12.
    expect(sliders[0]).toHaveAttribute("aria-valuemax", "12");
    expect(sliders[1]).toHaveAttribute("aria-valuemax", "12");
  });

  it("mounts the preview <video> with the SOURCE URL, not the currently-served trimmed URL", () => {
    mockedUseClipDuration.mockReturnValue(12);
    adminQueryResult = {
      data: makeAdminLineup(),
      isFetching: false,
      isSuccess: true,
      originalArgs: "l1",
    };
    const { container } = render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="throw"
        clipUrl="https://ex/CURRENT-trimmed.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /trim throw clip duration/i }),
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    // Must use the SOURCE URL, not the trimmed clipUrl — otherwise dragging
    // past the previous trim's bounds would show nothing.
    expect(video.getAttribute("src")).toBe("https://ex/source-throw.mp4");
    expect(video.muted).toBe(true);
    expect(video.getAttribute("aria-hidden")).toBe("true");
  });

  it("uses the landing source URL when pane=landing", () => {
    mockedUseClipDuration.mockReturnValue(8);
    adminQueryResult = {
      data: makeAdminLineup(),
      isFetching: false,
      isSuccess: true,
      originalArgs: "l1",
    };
    const { container } = render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="landing"
        clipUrl="https://ex/current.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /trim landing clip duration/i }),
    );
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe("https://ex/source-landing.mp4");
  });

  it("falls back to clipUrl as the source when the admin payload has no original (legacy/missed-backfill row)", () => {
    mockedUseClipDuration.mockReturnValue(5);
    adminQueryResult = {
      data: makeAdminLineup({
        clip_url_original: null, // legacy/missed-backfill row
      }),
      isFetching: false,
      isSuccess: true,
      originalArgs: "l1",
    };
    const { container } = render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="throw"
        clipUrl="https://ex/legacy.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /trim throw clip duration/i }),
    );
    const video = container.querySelector("video") as HTMLVideoElement;
    // Falls back to the public clipUrl — matches the server's defensive
    // fallback in pane_trim_service.
    expect(video.getAttribute("src")).toBe("https://ex/legacy.mp4");
  });

  // -------------------------------------------------------------------------
  // Apply / cancel behaviour
  // -------------------------------------------------------------------------

  it("Apply button is enabled when range >= MIN_TRIM_DURATION_S", () => {
    mockedUseClipDuration.mockReturnValue(5);
    adminQueryResult = {
      data: makeAdminLineup({
        clip_url_original: "https://ex/source.mp4",
      }),
      isFetching: false,
      isSuccess: true,
      originalArgs: "l1",
    };
    render(
      <PaneTrimOverlay
        lineupId="l1"
        pane="throw"
        clipUrl="https://ex/current.mp4"
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
    adminQueryResult = {
      data: makeAdminLineup(),
      isFetching: false,
      isSuccess: true,
      originalArgs: "l1",
    };
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
    expect(
      screen.getByRole("button", { name: /trim throw clip duration/i }),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Applying state
  // -------------------------------------------------------------------------

  it("applying state renders a role=status with aria-live=polite while the trim is in flight", async () => {
    mockedUseClipDuration.mockReturnValue(5);
    adminQueryResult = {
      data: makeAdminLineup(),
      isFetching: false,
      isSuccess: true,
      originalArgs: "l1",
    };
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
    adminQueryResult = {
      data: makeAdminLineup(),
      isFetching: false,
      isSuccess: true,
      originalArgs: "l1",
    };
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
    adminQueryResult = {
      data: makeAdminLineup(),
      isFetching: false,
      isSuccess: true,
      originalArgs: "l1",
    };
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
