import type { RefinementSession } from "../types/resume-refinement/refinement-session";

/**
 * Hands the session a refinement action answered with to `keep` (which puts it in the cache). A failed action
 * keeps nothing: the cache stays as it was, and the action's own invalidation reloads it.
 */
export async function keepReturnedSession(
  queryFulfilled: Promise<{ data: RefinementSession }>,
  keep: (session: RefinementSession) => unknown,
): Promise<void> {
  let session: RefinementSession;
  try {
    ({ data: session } = await queryFulfilled);
  } catch {
    return;
  }
  await keep(session);
}
