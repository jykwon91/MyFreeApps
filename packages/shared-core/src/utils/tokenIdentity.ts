import { readJwtPayload } from "./readJwtPayload";

/**
 * Who a session token belongs to: its `sub`, or the token itself when it names no
 * one, so an unreadable token never passes for the previous user. `null` when
 * signed out. A refreshed token for the same user has the same identity.
 */
export function tokenIdentity(token: string | null): string | null {
  if (!token) return null;
  const sub = readJwtPayload(token)?.sub;
  return typeof sub === "string" ? sub : token;
}
