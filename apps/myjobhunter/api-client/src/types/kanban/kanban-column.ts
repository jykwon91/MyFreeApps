/**
 * The four coarse-grained pipeline columns the kanban dashboard renders.
 * Mirrors ``KanbanColumn.ALL`` in ``apps/myjobhunter/backend/app/core/enums.py``.
 *
 * Per ``feedback_enum_changes_cross_stack``, this union must be updated in
 * the same PR as any backend-side enum change.
 */
export type KanbanColumn = "applied" | "interviewing" | "offer" | "closed";
