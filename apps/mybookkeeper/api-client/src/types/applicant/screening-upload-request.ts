/**
 * Multipart payload for ``POST /applicants/{id}/screening/upload-result``.
 *
 * Web and phone build the file part differently, so the caller hands over the finished form:
 * ``file``, ``status``, and ``adverse_action_snippet`` for ``fail`` / ``inconclusive``.
 */
export interface ScreeningUploadRequest {
  applicantId: string;
  form: FormData;
}
