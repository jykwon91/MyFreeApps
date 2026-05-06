/**
 * Platform-level user roles — mirrors the backend
 * `platform_shared.core.permissions.Role` enum.
 *
 * The backend remains the source of truth for authorization. The
 * frontend uses this constant only to gate UI affordances (e.g.
 * showing the admin nav link).
 */
export const ROLE = {
  ADMIN: "admin",
  USER: "user",
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];
