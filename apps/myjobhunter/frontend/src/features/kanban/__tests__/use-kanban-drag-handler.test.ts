/**
 * Unit tests for the pure helpers used by the kanban drag handler.
 *
 * The hook itself depends on a Redux store + RTK Query, which is heavy
 * to mock. The column id parsing is tested directly here; the optimistic
 * move it dispatches is covered in the api-client's moveKanbanItem tests.
 */
import { describe, it, expect } from "vitest";
import { columnDroppableId, columnFromDroppableId } from "../use-kanban-drag-handler";

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
