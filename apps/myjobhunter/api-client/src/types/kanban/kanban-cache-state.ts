import type { KanbanPatchThunk } from "./kanban-patch-thunk";

/** The store state a board patch reads: whatever holds the api's cache. */
export type KanbanCacheState = ReturnType<Parameters<KanbanPatchThunk>[1]>;
