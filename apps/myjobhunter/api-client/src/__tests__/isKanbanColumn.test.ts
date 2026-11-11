import { describe, expect, it } from "vitest";
import { isKanbanColumn } from "../utils/isKanbanColumn";

describe("isKanbanColumn", () => {
  it("accepts each board column", () => {
    for (const column of ["applied", "interviewing", "offer", "closed"]) expect(isKanbanColumn(column)).toBe(true);
  });

  it("rejects anything else", () => {
    for (const value of ["", "Applied", "rejected", "column-applied"]) expect(isKanbanColumn(value)).toBe(false);
  });
});
