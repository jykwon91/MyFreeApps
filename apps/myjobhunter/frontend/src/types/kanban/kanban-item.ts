/**
 * One row from ``GET /applications?view=kanban`` — a single kanban card.
 *
 * Mirrors ``ApplicationKanbanItem`` in
 * apps/myjobhunter/backend/app/schemas/application/application_kanban_item.py.
 */
export interface KanbanItem {
  id: string;
  role_title: string;
  applied_at: string | null;
  archived: boolean;

  company_id: string;
  company_name: string;
  company_logo_url: string | null;

  /**
   * The most-recent stage-defining event_type. ``note_added``,
   * ``email_received``, ``follow_up_sent`` are excluded by the backend
   * lateral subquery — they don't define a stage. ``null`` when the
   * application has no events yet (legacy).
   */
  latest_event_type: string | null;
  stage_entered_at: string | null;

  /** Verdict from the JobAnalysis that spawned this application, if any. */
  verdict: string | null;
}

export interface KanbanListResponse {
  items: KanbanItem[];
  total: number;
}
