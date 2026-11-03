/**
 * Body of `DELETE /users/me`.
 *
 * - `password`: re-verified against the stored hash
 * - `confirm_email`: must match the user's email (case-insensitive)
 * - `totp_code`: required only when the user has 2FA enabled; `null` otherwise
 */
export interface DeleteAccountRequest {
  password: string;
  confirm_email: string;
  totp_code?: string | null;
}
