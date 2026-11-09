import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { EVENT_MESSAGES } from "../../constants/calendarEventDetail";

/** The server's own wording can be a developer string, so it's never shown. */
export function notesFailure(error: unknown): string {
  switch (httpStatus(error)) {
    case 403:
      return EVENT_MESSAGES.notAllowed;
    case 404:
      return EVENT_MESSAGES.notesGone;
    default:
      return EVENT_MESSAGES.notesFailed;
  }
}

export function attachmentUploadFailure(error: unknown): string {
  switch (httpStatus(error)) {
    case 403:
      return EVENT_MESSAGES.notAllowed;
    case 404:
      return EVENT_MESSAGES.notesGone;
    case 413:
      return EVENT_MESSAGES.uploadTooBig;
    case 415:
      return EVENT_MESSAGES.uploadBadType;
    case 503:
      return EVENT_MESSAGES.uploadStorageDown;
    default:
      return EVENT_MESSAGES.uploadFailed;
  }
}

export function attachmentRemoveFailure(error: unknown): string {
  switch (httpStatus(error)) {
    case 403:
      return EVENT_MESSAGES.notAllowed;
    case 404:
      return EVENT_MESSAGES.attachmentGone;
    default:
      return EVENT_MESSAGES.removeFailed;
  }
}
