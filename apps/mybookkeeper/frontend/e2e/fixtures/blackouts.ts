import type { APIRequestContext } from "@playwright/test";

/** Hard-deletes a blackout through the test-only endpoint. Throws if nothing was deleted. */
export async function deleteBlackout(api: APIRequestContext, id: string): Promise<void> {
  const res = await api.delete(`/test/blackouts/${id}`);
  if (!res.ok()) throw new Error(`deleteBlackout failed: ${res.status()} ${await res.text()}`);
}
