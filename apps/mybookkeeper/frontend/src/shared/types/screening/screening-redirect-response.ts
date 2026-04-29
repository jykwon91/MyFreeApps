/**
 * Response shape for ``GET /applicants/{id}/screening/redirect``.
 *
 * The backend looks up the configured screening provider's dashboard URL
 * and the frontend opens it in a new tab. ``provider`` is included so the
 * UI can render "Open in KeyCheck" / "Open in <future provider>" without
 * a separate fetch.
 */
export interface ScreeningRedirectResponse {
  redirect_url: string;
  provider: string;
}
