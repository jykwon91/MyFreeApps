import type { InviteStatus } from "./invite-status";

/**
 * Admin-side invite representation. Returned by `POST /admin/invites`
 * and `GET /admin/invites`. Mirrors the backend `InviteRead` schema.
 */
export interface Invite {
  id: string;
  email: string;
  token: string;
  status: InviteStatus;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  created_by: string;
  created_at: string;
}
