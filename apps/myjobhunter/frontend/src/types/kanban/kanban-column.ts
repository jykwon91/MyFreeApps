/**
 * The four coarse-grained pipeline columns the kanban dashboard renders.
 * Mirrors ``KanbanColumn.ALL`` in ``apps/myjobhunter/backend/app/core/enums.py``.
 *
 * Per ``feedback_enum_changes_cross_stack``, this union must be updated in
 * the same PR as any backend-side enum change.
 */
export type KanbanColumn = "applied" | "interviewing" | "offer" | "closed";

export const KANBAN_COLUMN_ORDER: readonly KanbanColumn[] = [
  "applied",
  "interviewing",
  "offer",
  "closed",
] as const;

export const KANBAN_COLUMN_LABELS: Record<KanbanColumn, string> = {
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  closed: "Closed",
};
