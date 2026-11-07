import { expect } from "@playwright/test";
import type { SuperuserSession } from "./superuser-session";

/** Creates a demo user through the API. Returns its id and the credentials shown once. */
export async function createDemoUser(
  session: SuperuserSession,
  tag: string,
): Promise<{ userId: string; email: string; password: string }> {
  const res = await session.api.post("/admin/demo/create", { headers: session.stepUpHeaders(), data: { tag } });
  expect(res.ok(), await res.text()).toBe(true);
  const { credentials } = (await res.json()) as { credentials: { email: string; password: string } };
  const ids = await demoUserIdsTagged(session, tag);
  expect(ids).toHaveLength(1);
  return { userId: ids[0], ...credentials };
}

/** Ids of the demo users tagged ``tag``. */
export async function demoUserIdsTagged(session: SuperuserSession, tag: string): Promise<string[]> {
  const res = await session.api.get("/admin/demo/users");
  expect(res.ok(), await res.text()).toBe(true);
  const { users } = (await res.json()) as { users: Array<{ user_id: string; tag: string }> };
  return users.filter((u) => u.tag === tag).map((u) => u.user_id);
}

/** Deletes every demo user tagged ``tag``. */
export async function deleteDemoUsersTagged(session: SuperuserSession, tag: string): Promise<void> {
  for (const id of await demoUserIdsTagged(session, tag)) {
    const res = await session.api.delete(`/admin/demo/users/${id}`, { headers: session.stepUpHeaders() });
    expect(res.ok(), await res.text()).toBe(true);
  }
}
