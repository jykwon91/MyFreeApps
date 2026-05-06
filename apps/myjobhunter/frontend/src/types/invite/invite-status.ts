/**
 * Computed-state enum for a platform invite. Mirrors
 * apps/myjobhunter/backend/app/schemas/platform/invite_status.py exactly.
 *
 * The backend recomputes status on every read from `accepted_at` and
 * `expires_at`; the frontend never derives it locally — always reads
 * the API value.
 */
export const INVITE_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  EXPIRED: "expired",
} as const;

export type InviteStatus = (typeof INVITE_STATUS)[keyof typeof INVITE_STATUS];
