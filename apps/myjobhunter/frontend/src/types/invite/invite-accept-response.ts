/**
 * Response body for `POST /invites/{token}/accept`.
 */
export interface InviteAcceptResponse {
  invite_id: string;
  accepted_at: string;
}
