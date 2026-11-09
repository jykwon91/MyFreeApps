/**
 * A 409 on a welcome-manual reorder means the list changed under the user.
 * The UI shows the fixed stale-order copy (never the server detail) and
 * resets to the server order; any other failure keeps the generic message.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { showError } from "@platform/ui";
import { WELCOME_MANUAL_STALE_ORDER_MESSAGE } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import { reorderFailureMessage } from "@/app/features/welcome-manuals/reorder-failure-message";
import { useWelcomeManualSectionOrder } from "@/app/features/welcome-manuals/useWelcomeManualSectionOrder";
import type { WelcomeManualSectionResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-response";

const reorderSectionsMock = vi.fn();

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
}));

vi.mock("@mybookkeeper/api-client/store/welcomeManualsApi", () => ({
  useReorderSectionsMutation: vi.fn(() => [reorderSectionsMock, { isLoading: false }]),
}));

function makeSection(id: string, display_order: number): WelcomeManualSectionResponse {
  return {
    id,
    manual_id: "m-1",
    room_id: null,
    title: id,
    body: "",
    display_order,
    fields: [],
    images: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const SECTIONS = [makeSection("a", 0), makeSection("b", 1)];
const DRAG_A_OVER_B = { active: { id: "a" }, over: { id: "b" } } as never;

describe("reorderFailureMessage", () => {
  it("returns the stale-order copy for a 409", () => {
    expect(reorderFailureMessage({ status: 409, data: { detail: "server text" } })).toBe(
      WELCOME_MANUAL_STALE_ORDER_MESSAGE,
    );
  });

  it("returns the generic copy for other failures", () => {
    expect(reorderFailureMessage({ status: 500 })).toMatch(/Reverting/);
    expect(reorderFailureMessage(new Error("boom"))).toMatch(/Reverting/);
  });
});

describe("useWelcomeManualSectionOrder reorder failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the stale-order copy on 409 and resets to the server order", async () => {
    reorderSectionsMock.mockReturnValue({
      unwrap: () => Promise.reject({ status: 409, data: { detail: "internal detail" } }),
    });
    const { result } = renderHook(() =>
      useWelcomeManualSectionOrder({ manualId: "m-1", sections: SECTIONS }),
    );

    await act(async () => {
      await result.current.handleDragEnd(DRAG_A_OVER_B);
    });

    expect(showError).toHaveBeenCalledWith(WELCOME_MANUAL_STALE_ORDER_MESSAGE);
    expect(result.current.orderedIds).toEqual(["a", "b"]);
  });

  it("keeps the generic message for non-409 errors", async () => {
    reorderSectionsMock.mockReturnValue({ unwrap: () => Promise.reject({ status: 500 }) });
    const { result } = renderHook(() =>
      useWelcomeManualSectionOrder({ manualId: "m-1", sections: SECTIONS }),
    );

    await act(async () => {
      await result.current.handleDragEnd(DRAG_A_OVER_B);
    });

    expect(showError).toHaveBeenCalledWith("I couldn't save the new order. Reverting.");
  });
});
