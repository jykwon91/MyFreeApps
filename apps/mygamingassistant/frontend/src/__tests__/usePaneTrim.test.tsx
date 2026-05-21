/**
 * usePaneTrim hook tests — PR2 trim state machine.
 *
 * The hook drives a four-state machine (closed → open → applying →
 * closed|error). We mock the underlying RTK mutation so each test can pick
 * its outcome (resolve vs reject) and we can observe the phase transitions
 * directly without an HTTP round-trip.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const unwrap = vi.fn();
const trimPaneMutation = vi.fn(() => ({ unwrap }));
vi.mock("@/store/lineupsApi", () => ({
  useTrimPaneMutation: () => [trimPaneMutation, {}],
}));

import { usePaneTrim } from "@/hooks/usePaneTrim";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("usePaneTrim", () => {
  it("starts in closed phase", () => {
    const { result } = renderHook(() =>
      usePaneTrim({ lineupId: "l1", pane: "throw" }),
    );
    expect(result.current.phase.phase).toBe("closed");
  });

  it("open(d) transitions to open with the full clip as the default range", () => {
    const { result } = renderHook(() =>
      usePaneTrim({ lineupId: "l1", pane: "throw" }),
    );
    act(() => result.current.open(7.5));

    const { phase } = result.current;
    if (phase.phase !== "open") throw new Error(`expected open, got ${phase.phase}`);
    expect(phase.startOffsetS).toBe(0);
    expect(phase.endOffsetS).toBe(7.5);
    expect(phase.clipDurationS).toBe(7.5);
  });

  it("updateRange clamps inputs to [0, clipDurationS] while open", () => {
    const { result } = renderHook(() =>
      usePaneTrim({ lineupId: "l1", pane: "throw" }),
    );
    act(() => result.current.open(5));
    act(() => result.current.updateRange(-2, 99));

    const { phase } = result.current;
    if (phase.phase !== "open") throw new Error("expected open");
    expect(phase.startOffsetS).toBe(0);
    expect(phase.endOffsetS).toBe(5);
  });

  it("updateRange is a no-op when not in open phase", () => {
    const { result } = renderHook(() =>
      usePaneTrim({ lineupId: "l1", pane: "throw" }),
    );
    // Still closed.
    act(() => result.current.updateRange(1, 2));
    expect(result.current.phase.phase).toBe("closed");
  });

  it("apply is a no-op when not in open phase (no trim request fired)", () => {
    const { result } = renderHook(() =>
      usePaneTrim({ lineupId: "l1", pane: "throw" }),
    );
    act(() => result.current.apply());
    expect(result.current.phase.phase).toBe("closed");
    expect(trimPaneMutation).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // Happy path: closed → open → applying → closed
  // ---------------------------------------------------------------------

  it("happy path: open → apply succeeds → closed (after RTK invalidation)", async () => {
    unwrap.mockResolvedValue({ id: "l1" });

    const { result } = renderHook(() =>
      usePaneTrim({ lineupId: "l1", pane: "throw" }),
    );
    act(() => result.current.open(5));
    act(() => result.current.apply());

    // Synchronous transition to applying.
    expect(result.current.phase.phase).toBe("applying");

    await waitFor(() => expect(result.current.phase.phase).toBe("closed"));
    expect(trimPaneMutation).toHaveBeenCalledWith({
      lineup_id: "l1",
      pane: "throw",
      start_offset_s: 0,
      end_offset_s: 5,
    });
  });

  // ---------------------------------------------------------------------
  // Error → retry → applying → closed
  // ---------------------------------------------------------------------

  it("error → retry → applying → closed when the second attempt succeeds", async () => {
    unwrap
      .mockRejectedValueOnce({ data: { detail: "ffmpeg blew up" } })
      .mockResolvedValueOnce({ id: "l1" });

    const { result } = renderHook(() =>
      usePaneTrim({ lineupId: "l1", pane: "landing" }),
    );
    act(() => result.current.open(3));
    act(() => result.current.apply());

    await waitFor(() => expect(result.current.phase.phase).toBe("error"));
    const errPhase = result.current.phase;
    if (errPhase.phase !== "error") throw new Error("expected error");
    expect(errPhase.message).toBe("ffmpeg blew up");
    expect(errPhase.startOffsetS).toBe(0);
    expect(errPhase.endOffsetS).toBe(3);

    act(() => result.current.retry());
    expect(result.current.phase.phase).toBe("applying");

    await waitFor(() => expect(result.current.phase.phase).toBe("closed"));
    expect(trimPaneMutation).toHaveBeenCalledTimes(2);
  });

  it("falls back to a default error message when the rejection has no detail", async () => {
    unwrap.mockRejectedValueOnce(new Error("network"));

    const { result } = renderHook(() =>
      usePaneTrim({ lineupId: "l1", pane: "throw" }),
    );
    act(() => result.current.open(3));
    act(() => result.current.apply());

    await waitFor(() => expect(result.current.phase.phase).toBe("error"));
    const errPhase = result.current.phase;
    if (errPhase.phase !== "error") throw new Error("expected error");
    expect(errPhase.message).toBe("Could not trim clip");
  });

  // ---------------------------------------------------------------------
  // Close from error
  // ---------------------------------------------------------------------

  it("close() from error state returns to closed without firing another trim", async () => {
    unwrap.mockRejectedValueOnce({ data: { detail: "boom" } });

    const { result } = renderHook(() =>
      usePaneTrim({ lineupId: "l1", pane: "throw" }),
    );
    act(() => result.current.open(3));
    act(() => result.current.apply());
    await waitFor(() => expect(result.current.phase.phase).toBe("error"));

    act(() => result.current.close());
    expect(result.current.phase.phase).toBe("closed");
    expect(trimPaneMutation).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------
  // retry is a no-op outside error
  // ---------------------------------------------------------------------

  it("retry is a no-op when not in error phase", () => {
    const { result } = renderHook(() =>
      usePaneTrim({ lineupId: "l1", pane: "throw" }),
    );
    act(() => result.current.retry());
    expect(result.current.phase.phase).toBe("closed");
    expect(trimPaneMutation).not.toHaveBeenCalled();
  });
});
