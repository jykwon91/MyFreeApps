/**
 * Subset of the fastapi-users `UserRead` payload returned by `GET /users/me`.
 * Only the fields the UI consumes are typed here; the API carries more that is
 * deliberately ignored.
 *
 * `is_superuser` is surfaced so a client can gate its admin screens. The backend
 * remains the source of truth for authorization: every admin-only route is also
 * validated server-side against `current_superuser`.
 */
export interface CurrentUser {
  id: string;
  email: string;
  display_name: string;
  totp_enabled: boolean;
  is_verified: boolean;
  is_superuser: boolean;
}
