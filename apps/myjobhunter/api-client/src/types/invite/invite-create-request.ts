/**
 * Request body for `POST /admin/invites`. Mirrors the backend
 * `InviteCreateRequest` Pydantic schema.
 */
export interface InviteCreateRequest {
  email: string;
}
