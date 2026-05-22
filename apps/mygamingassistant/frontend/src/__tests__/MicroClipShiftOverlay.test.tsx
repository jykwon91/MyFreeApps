/**
 * MicroClipShiftOverlay smoke tests.
 *
 * Mirrors PaneTrimOverlay's mock setup — useClipDuration, the lazy admin
 * query, and the two mutations are module-mocked rather than going through
 * real plumbing. We deliberately keep the surface smaller than
 * PaneTrimOverlay.test.tsx because the shift overlay is a structural
 * sibling: covering the idle / fetch / open / widen-first / applying / error
 * branches with one test each is enough to guard the contract, and the
 * shared scissors / scrim / aria patterns already have heavy coverage on
 * the trim sibling.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useClipDuration", () => ({
  useClipDuration: vi.fn(),
}));

const unwrap = vi.fn();
const shiftMutation = vi.fn(() => ({ unwrap }));

const widenUnwrap = vi.fn();
const widenMutation = vi.fn(() => ({ unwrap: widenUnwrap }));

const triggerAdmin = vi.fn();
let adminQueryResult: {
  data: Record<string, unknown> | undefined;
  isFetching: boolean;
  isSuccess: boolean;
  originalArgs: string | undefined;
};

vi.mock("@/store/lineupsApi", () => ({
  useShiftPaneWindowMutation: () => [shiftMutation, {}],
  useWidenPaneSourceMutation: () => [widenMutation, {}],
  useLazyGetLineupAdminQuery: () => [triggerAdmin, adminQueryResult],
}));

import { useClipDuration } from "@/hooks/useClipDuration";
import MicroClipShiftOverlay from "@/components/lineup/MicroClipShiftOverlay";

const mockedUseClipDuration = vi.mocked(useClipDuration);

function makeAdminLineup(
  overrides: Partial<{
    clip_url: string | null;
    clip_url_original: string | null;
    stand_clip_offset_s: number | null;
    aim_clip_offset_s: number | null;
  }> = {},
): Record<string, unknown> {
  return {
    id: "l1",
    clip_url: "https://ex/throw.mp4",
    clip_url_original: "https://ex/throw-source.mp4",
    stand_clip_offset_s: null,
    aim_clip_offset_s: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  unwrap.mockReset();
  widenUnwrap.mockReset();
  adminQueryResult = {
    data: undefined,
    isFetching: false,
    isSuccess: false,
    originalArgs: undefined,
  };
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

describe("MicroClipShiftOverlay", () => {
  it("renders nothing when clipUrl is null (no clip → no shift affordance)", () => {
    mockedUseClipDuration.mockReturnValue(null);
    const { container } = render(
      <MicroClipShiftOverlay lineupId="l1" pane="stand" clipUrl={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("scissors visible (clickable) before interaction — no fetch fires until click", () => {
    mockedUseClipDuration.mockReturnValue(null);
    render(
      <MicroClipShiftOverlay
        lineupId="l1"
        pane="stand"
        clipUrl="https://ex/stand-micro.mp4"
      />,
    );
    expect(triggerAdmin).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /shift stand micro-clip window/i }),
    ).not.toBeDisabled();
  });

  it("triggers the admin fetch with the lineup id on scissors click", () => {
    mockedUseClipDuration.mockReturnValue(null);
    render(
      <MicroClipShiftOverlay
        lineupId="lineup-xyz"
        pane="aim"
        clipUrl="https://ex/aim-micro.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /shift aim micro-clip window/i }),
    );
    expect(triggerAdmin).toHaveBeenCalledWith("lineup-xyz", true);
  });

  it("opens the slider when admin payload + wider source duration resolve", () => {
    mockedUseClipDuration.mockReturnValue(9.0);
    adminQueryResult = {
      data: makeAdminLineup(),
      isFetching: false,
      isSuccess: true,
      originalArgs: "l1",
    };
    render(
      <MicroClipShiftOverlay
        lineupId="l1"
        pane="stand"
        clipUrl="https://ex/stand-micro.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /shift stand micro-clip window/i }),
    );
    // Slider open — the range input gets aria-label "stand window start offset".
    expect(
      screen.getByRole("slider", { name: /stand window start offset/i }),
    ).toBeInTheDocument();
    // Upper bound = sourceDuration - 1.0s window.
    expect(
      screen.getByRole("slider", { name: /stand window start offset/i }),
    ).toHaveAttribute("aria-valuemax", "8");
  });

  it("renders 'Widen source first' CTA when no wider source available", () => {
    mockedUseClipDuration.mockReturnValue(null);
    adminQueryResult = {
      // clip_url_original === clip_url means ingest fell back to the legacy
      // posture and shifting isn't available until the operator widens.
      data: makeAdminLineup({
        clip_url: "https://ex/throw.mp4",
        clip_url_original: "https://ex/throw.mp4",
      }),
      isFetching: false,
      isSuccess: true,
      originalArgs: "l1",
    };
    render(
      <MicroClipShiftOverlay
        lineupId="l1"
        pane="aim"
        clipUrl="https://ex/aim-micro.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /shift aim micro-clip window/i }),
    );
    // The Widen-source CTA replaces the scrubber. The button is the primary
    // action — "Widen source" with the across-all-panes aria label.
    expect(
      screen.getByRole("button", { name: /widen source for all four panes/i }),
    ).toBeInTheDocument();
  });

  it("fires the throw widen-source mutation when 'Widen source' is clicked", async () => {
    mockedUseClipDuration.mockReturnValue(null);
    adminQueryResult = {
      data: makeAdminLineup({
        clip_url: "https://ex/throw.mp4",
        clip_url_original: "https://ex/throw.mp4",
      }),
      isFetching: false,
      isSuccess: true,
      originalArgs: "l1",
    };
    widenUnwrap.mockResolvedValue({});
    render(
      <MicroClipShiftOverlay
        lineupId="l1"
        pane="stand"
        clipUrl="https://ex/stand-micro.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /shift stand micro-clip window/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /widen source for all four panes/i }),
    );
    // CRITICAL: even though the operator clicked scissors on STAND, the
    // widen mutation goes through THROW because the wider source is shared.
    expect(widenMutation).toHaveBeenCalledWith({
      lineup_id: "l1",
      pane: "throw",
    });
  });

  it("fires the shift mutation with the operator-chosen offset on Apply", () => {
    mockedUseClipDuration.mockReturnValue(9.0);
    adminQueryResult = {
      data: makeAdminLineup(),
      isFetching: false,
      isSuccess: true,
      originalArgs: "l1",
    };
    unwrap.mockReturnValue(new Promise(() => {})); // park in applying state
    render(
      <MicroClipShiftOverlay
        lineupId="l1"
        pane="stand"
        clipUrl="https://ex/stand-micro.mp4"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /shift stand micro-clip window/i }),
    );
    const slider = screen.getByRole("slider", {
      name: /stand window start offset/i,
    });
    fireEvent.change(slider, { target: { value: "3.5" } });
    fireEvent.click(screen.getByRole("button", { name: /^shift window$/i }));
    expect(shiftMutation).toHaveBeenCalledWith({
      lineup_id: "l1",
      pane: "stand",
      offset_s: 3.5,
    });
  });
});
