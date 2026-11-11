/**
 * Unit tests for the pure helpers used by the kanban drag handler.
 *
 * The hook itself depends on a Redux store + RTK Query, which is heavy
 * to mock. The column id parsing is tested directly here; the optimistic
 * move it dispatches is covered in the api-client's moveKanbanItem tests.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";
import { columnDroppableId, columnFromDroppableId, useKanbanDragHandler } from "../use-kanban-drag-handler";

describe("columnDroppableId / columnFromDroppableId", () => {
  it("round-trips each column id", () => {
    for (const col of ["applied", "interviewing", "offer", "closed"] as const) {
      expect(columnFromDroppableId(columnDroppableId(col))).toBe(col);
    }
  });

  it("returns null for unrelated drop ids", () => {
    expect(columnFromDroppableId("card-123")).toBeNull();
    expect(columnFromDroppableId("column-not-real")).toBeNull();
    expect(columnFromDroppableId(null)).toBeNull();
    expect(columnFromDroppableId(undefined)).toBeNull();
  });
});

const CARD: KanbanItem = {
  id: "card-1",
  role_title: "Engineer",
  applied_at: null,
  archived: false,
  company_id: "c1",
  company_name: "Acme",
  company_logo_url: null,
  latest_event_type: "applied",
  stage_entered_at: null,
  verdict: null,
};

function dropEvent(overId: string | null): DragEndEvent {
  return { active: { id: "card-1" }, over: overId === null ? null : { id: overId } } as unknown as DragEndEvent;
}

describe("useKanbanDragHandler", () => {
  it("moves the dropped card through the shared move, which toasts the outcome", async () => {
    const moveTo = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useKanbanDragHandler({ itemFor: () => CARD, moveTo }));
    await result.current.onDragEnd(dropEvent(columnDroppableId("offer")));
    expect(moveTo).toHaveBeenCalledWith(CARD, "applied", "offer");
  });

  it("ignores a drop outside any column or for an unknown card", async () => {
    const moveTo = vi.fn();
    const { result } = renderHook(() => useKanbanDragHandler({ itemFor: () => null, moveTo }));
    await result.current.onDragEnd(dropEvent(null));
    await result.current.onDragEnd(dropEvent(columnDroppableId("offer")));
    expect(moveTo).not.toHaveBeenCalled();
  });
});
