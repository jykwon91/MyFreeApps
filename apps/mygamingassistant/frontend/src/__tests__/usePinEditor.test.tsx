/**
 * usePinEditor tests — selection via ?edit=, confirmed/next accounting, the
 * PATCH payload shape (only explicitly-set anchors are sent), and the
 * no-revert-on-failure guarantee.
 *
 * The RTK mutation and the toast helpers are mocked (mirrors ReviewCard.test)
 * so we can assert call arguments without a real store or server.
 */
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { usePinEditor, isLineupConfirmed } from "@/hooks/usePinEditor";
import type { Lineup } from "@/types/game";

// --- Mocks -----------------------------------------------------------------

const updateTrigger = vi.fn();
vi.mock("@/store/lineupsApi", () => ({
  useUpdateLineupMutation: () => [updateTrigger, { isLoading: false }],
}));

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock("@platform/ui", () => ({
  showSuccess: (...a: unknown[]) => showSuccess(...a),
  showError: (...a: unknown[]) => showError(...a),
  extractErrorMessage: () => "boom",
}));

// --- Helpers ---------------------------------------------------------------

function lineup(id: string, standAnchorX: number | null): Lineup {
  return {
    id,
    title: `lineup ${id}`,
    stand_anchor_x: standAnchorX,
    stand_anchor_y: standAnchorX,
    target_anchor_x: null,
    target_anchor_y: null,
    effective_stand_x: 0.5,
    effective_stand_y: 0.5,
    effective_target_x: 0.5,
    effective_target_y: 0.5,
  } as unknown as Lineup;
}

function renderEditor(lineups: Lineup[], search: string) {
  return renderHook(() => usePinEditor({ lineups, isSuperuser: true }), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[`/valorant/ascent${search}`]}>
        {children}
      </MemoryRouter>
    ),
  });
}

beforeEach(() => {
  updateTrigger.mockReset();
  showSuccess.mockReset();
  showError.mockReset();
  // Default: resolve successfully.
  updateTrigger.mockReturnValue({ unwrap: () => Promise.resolve({}) });
});

// --- Tests -----------------------------------------------------------------

describe("isLineupConfirmed", () => {
  it("is true only when an explicit stand anchor is set", () => {
    expect(isLineupConfirmed(lineup("a", 0.3))).toBe(true);
    expect(isLineupConfirmed(lineup("b", null))).toBe(false);
  });
});

describe("usePinEditor", () => {
  it("counts confirmed lineups and total", () => {
    const { result } = renderEditor([lineup("a", 0.3), lineup("b", null), lineup("c", 0.9)], "");
    expect(result.current.confirmedCount).toBe(2);
    expect(result.current.totalCount).toBe(3);
  });

  it("selects the ?edit lineup and reports a next unconfirmed target", () => {
    const { result } = renderEditor(
      [lineup("a", 0.3), lineup("b", null), lineup("c", null)],
      "?edit=b",
    );
    expect(result.current.selectedLineup?.id).toBe("b");
    // c is still unconfirmed → Save & Next has somewhere to go.
    expect(result.current.hasNext).toBe(true);
  });

  it("sends only explicitly-positioned anchors on save", async () => {
    const { result } = renderEditor([lineup("a", null)], "?edit=a");
    // Operator drags the stand pin only; target stays on centroid fallback.
    act(() => result.current.onStandChange(0.25, 0.75));
    await act(async () => {
      await result.current.save(false);
    });
    expect(updateTrigger).toHaveBeenCalledWith({
      id: "a",
      patch: { stand_anchor_x: 0.25, stand_anchor_y: 0.75 },
    });
    expect(showSuccess).toHaveBeenCalled();
  });

  it("does not revert the dragged position when the save fails", async () => {
    updateTrigger.mockReturnValue({ unwrap: () => Promise.reject(new Error("nope")) });
    const { result } = renderEditor([lineup("a", null)], "?edit=a");
    act(() => result.current.onStandChange(0.11, 0.22));
    await act(async () => {
      await result.current.save(false);
    });
    expect(showError).toHaveBeenCalled();
    // Field state retained so the operator can retry.
    expect(result.current.standAnchorX).toBe("0.11");
    expect(result.current.standAnchorY).toBe("0.22");
  });
});
