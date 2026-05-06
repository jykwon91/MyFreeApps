import type { InviteStatus } from "./invite-status";

/**
 * Public preview payload returned by `GET /invites/{token}/info`.
 * Deliberately narrow — never includes inviter identity / id /
 * created_at. See backend `InviteInfoResponse` for the full reasoning.
 */
export interface InviteInfo {
  email: string;
  status: InviteStatus;
  expires_at: string;
}
