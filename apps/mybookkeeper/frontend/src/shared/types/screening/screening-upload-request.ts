/**
 * Multipart payload for ``POST /applicants/{id}/screening/upload-result``.
 *
 * The RTK Query layer serialises this into ``FormData``. ``adverse_action_snippet``
 * is omitted from the form when the host doesn't enter one — required only
 * for ``fail`` / ``inconclusive`` statuses (FCRA adverse-action notice).
 */
import type { ScreeningStatus } from "./screening-status";

export interface ScreeningUploadRequest {
  applicantId: string;
  file: File;
  status: ScreeningStatus;
  adverseActionSnippet?: string | null;
}
