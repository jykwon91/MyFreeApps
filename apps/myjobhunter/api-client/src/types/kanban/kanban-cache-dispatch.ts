import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import type { KanbanCacheState } from "./kanban-cache-state";

/** A store's dispatch, as far as moving a card needs: it reaches the api's cache. */
export type KanbanCacheDispatch = ThunkDispatch<KanbanCacheState, unknown, UnknownAction>;
