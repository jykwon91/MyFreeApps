import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";

/** A card as GET /applications?view=kanban lists it, with whatever a test cares about changed. */
export function kanbanRecord(overrides: Partial<KanbanItem> & Pick<KanbanItem, "id">): KanbanItem {
  return {
    role_title: "Software Engineer",
    applied_at: null,
    archived: false,
    company_id: `c-${overrides.id}`,
    company_name: "Acme",
    company_logo_url: null,
    latest_event_type: "applied",
    stage_entered_at: null,
    verdict: null,
    ...overrides,
  };
}
