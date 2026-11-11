import { describe, expect, it } from "vitest";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";
import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import { groupKanbanItems } from "@myjobhunter/api-client/utils/groupKanbanItems";
import { activeApplicationCount } from "../activeApplicationCount";

function card(id: string, latest_event_type: KanbanItem["latest_event_type"]): KanbanItem {
  return {
    id,
    role_title: "Engineer",
    applied_at: null,
    archived: false,
    company_id: "c1",
    company_name: "Acme",
    company_logo_url: null,
    latest_event_type,
    stage_entered_at: "2026-05-01T00:00:00Z",
    verdict: null,
  };
}

describe("activeApplicationCount", () => {
  it("counts every stage but Closed", () => {
    const grouped = groupKanbanItems([
      card("1", "applied"),
      card("2", "interview_scheduled"),
      card("3", "offer_received"),
      card("4", "rejected"),
      card("5", "rejected"),
    ]);
    expect(activeApplicationCount(grouped)).toBe(3);
  });

  it("is zero when everything is closed", () => {
    const grouped: Record<KanbanColumn, KanbanItem[]> = groupKanbanItems([card("1", "rejected")]);
    expect(activeApplicationCount(grouped)).toBe(0);
  });
});
