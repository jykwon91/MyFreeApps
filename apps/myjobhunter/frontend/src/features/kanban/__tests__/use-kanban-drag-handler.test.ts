/**
 * Unit tests for the pure helpers used by the kanban drag handler.
 *
 * The hook itself depends on a Redux store + RTK Query, which is heavy
 * to mock. The pure helpers (column id parsing, optimistic patch shape)
 * carry the load-bearing logic and are tested directly.
 */
import { describe, it, expect } from "vitest";
import {
  applyOptimisticTransition,
  columnDroppableId,
  columnFromDroppableId,
} from "../use-kanban-drag-handler";
import type { KanbanItem } from "@/types/kanban/kanban-item";

function makeItem(overrides: Partial<KanbanItem> = {}): KanbanItem {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    role_title: "Senior Engineer",
    applied_at: null,
    archived: false,
    company_id: "00000000-0000-4000-8000-000000000001",
    company_name: "Acme",
    company_logo_url: null,
    latest_event_type: "applied",
    stage_entered_at: "2026-05-01T00:00:00Z",
    verdict: null,
    ...overrides,
  };
}

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

describe("applyOptimisticTransition", () => {
  it("updates only the matching item's latest_event_type and stage_entered_at", () => {
    const items = [
      makeItem({ id: "a", latest_event_type: "applied" }),
      makeItem({ id: "b", latest_event_type: "interview_scheduled" }),
    ];
    const occurred = "2026-06-01T00:00:00Z";
    const next = applyOptimisticTransition(items, "a", "interviewing", occurred);

    expect(next[0]).toEqual({
      ...items[0],
      latest_event_type: "interview_scheduled",
      stage_entered_at: occurred,
    });
    expect(next[1]).toBe(items[1]); // unrelated item unchanged identity-wise
  });

  it("maps each target column to the correct default event_type", () => {
    const items = [makeItem({ id: "x", latest_event_type: "applied" })];
    const occurred = "2026-06-01T00:00:00Z";

    expect(applyOptimisticTransition(items, "x", "applied", occurred)[0].latest_event_type).toBe(
      "applied",
    );
    expect(
      applyOptimisticTransition(items, "x", "interviewing", occurred)[0].latest_event_type,
    ).toBe("interview_scheduled");
    expect(applyOptimisticTransition(items, "x", "offer", occurred)[0].latest_event_type).toBe(
      "offer_received",
    );
    expect(applyOptimisticTransition(items, "x", "closed", occurred)[0].latest_event_type).toBe(
      "rejected",
    );
  });

  it("returns a new list reference even when the target id is missing", () => {
    const items = [makeItem({ id: "a" })];
    const next = applyOptimisticTransition(items, "missing", "interviewing", "2026-06-01");
    expect(next).not.toBe(items);
    expect(next).toEqual(items);
  });
});
