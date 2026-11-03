import { COOK_SESSION_MAX_AGE_MS } from "../constants/cook";
import type { CookSession } from "../types/CookSession";

/** The saved session to carry on from when opening, if there's one worth resuming. */
export function resumableCookSession(
  session: CookSession | undefined,
  versionId: string,
  lastPage: number,
  now: number,
): CookSession | undefined {
  if (!session || session.versionId !== versionId) return undefined;
  if (session.pageIndex >= lastPage) return undefined;
  return now - session.updatedAt <= COOK_SESSION_MAX_AGE_MS ? session : undefined;
}
