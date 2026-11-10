import type { InviteStatus } from "./invite-status";

/**
 * Admin-side invite representation. Returned by `POST /admin/invites`
 * and `GET /admin/invites`. Mirrors the backend `InviteRead` schema.
 *
 * The raw token is intentionally absent — the backend persists only
 * `sha256(token)` and emits the raw value exactly once via email. If
 * the recipient never gets the email the admin's recourse is to
 * cancel + reissue, not to copy a token off this object.
 */
export interface Invite {
  id: string;
  email: string;
  status: InviteStatus;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  created_by: string;
  created_at: string;
}
