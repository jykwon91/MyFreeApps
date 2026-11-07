import type { APIRequestContext } from "@playwright/test";

/** Hard-deletes a lease template through the test-only endpoint. Throws if nothing was deleted. */
export async function deleteTemplate(api: APIRequestContext, id: string): Promise<void> {
  const res = await api.delete(`/test/lease-templates/${id}`);
  if (!res.ok()) throw new Error(`deleteTemplate failed: ${res.status()} ${await res.text()}`);
}
