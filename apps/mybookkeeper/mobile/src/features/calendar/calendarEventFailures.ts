import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
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

/** A lost answer or a proxy error can come after the file was stored (see writeOutcome), and sending it again adds a second copy. */
export function attachmentUploadFailure(error: unknown): string {
  if (writeOutcome(error) === "unknown") return EVENT_MESSAGES.uploadUnsure;
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
