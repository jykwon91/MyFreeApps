/**
 * Response from creating, rotating, or reading a welcome manual's share
 * link. ``share_path`` is the app-relative guest path (``/guide/<token>``);
 * the frontend joins it with ``window.location.origin`` to build the full
 * copyable URL.
 */
export interface WelcomeManualShareResponse {
  share_token: string;
  share_path: string;
  share_pin: string;
}
