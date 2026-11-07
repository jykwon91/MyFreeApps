import type { APIRequestContext } from "@playwright/test";

/** Hard-deletes a signed lease through the test-only endpoint. Throws if nothing was deleted. */
export async function deleteSignedLease(api: APIRequestContext, id: string): Promise<void> {
  const res = await api.delete(`/test/signed-leases/${id}`);
  if (!res.ok()) throw new Error(`deleteSignedLease failed: ${res.status()} ${await res.text()}`);
}
