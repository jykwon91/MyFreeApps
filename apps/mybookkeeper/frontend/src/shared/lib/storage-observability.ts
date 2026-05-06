import posthog from "posthog-js";

/**
 * Capture a "stored object missing" event to operator-facing
 * observability channels — PostHog + console — without surfacing the
 * problem in the user-facing UI.
 *
 * Backend already fires a Sentry warning when its HEAD-check returns
 * NoSuchKey (see ``app/services/storage/presigned_url_attacher.py``).
 * This frontend hook fires when the user actually attempts to interact
 * with a flagged row, giving the operator both server-side and
 * client-side signal for the same orphan.
 *
 * The visible UI never renders a "File missing" alert — per the project
 * rule that error chrome belongs in observability dashboards, not the
 * user's daily flow.
 */
export interface MissingObjectEventPayload {
  domain: string;
  attachment_id: string;
  storage_key: string;
  parent_id?: string;
  parent_kind?: string;
}

export function reportMissingStorageObject(payload: MissingObjectEventPayload): void {
  // PostHog — primary observability surface for product analytics
  // and operator dashboards. Falls back silently when PostHog isn't
  // initialized (local dev without VITE_POSTHOG_KEY).
  posthog.capture("storage_object_missing", payload);

  // Console — surfaces in DevTools without requiring PostHog access.
  // Network-tab inspection of failed presigned-URL requests will
  // also expose the underlying NoSuchKey response from MinIO.
  console.warn("[storage] missing object", payload);
}
