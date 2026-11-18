import { APPLICATION_EVENTS_TAG } from "../constants/applicationEventsTag";
import { APPLICATIONS_KANBAN_LIST_ID } from "../constants/applicationsKanbanListId";
import { APPLICATIONS_TAG } from "../constants/applicationsTag";
import { applicationsApi } from "./applicationsApi";

/**
 * Makes everything that shows an application's stage read it from the server again. Dispatched when a move's answer was
 * lost, so the server may or may not have moved it and what's on screen can't be trusted.
 */
export function refetchAfterLostMove(applicationId: string) {
  return applicationsApi.util.invalidateTags([
    { type: APPLICATION_EVENTS_TAG, id: applicationId },
    { type: APPLICATIONS_TAG, id: applicationId },
    { type: APPLICATIONS_TAG, id: "LIST" },
    { type: APPLICATIONS_TAG, id: APPLICATIONS_KANBAN_LIST_ID },
  ]);
}
