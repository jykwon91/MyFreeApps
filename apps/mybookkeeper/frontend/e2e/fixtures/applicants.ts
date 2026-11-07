import type { APIRequestContext } from "@playwright/test";

/** Hard-deletes an applicant through the test-only endpoint. Throws if nothing was deleted. Delete its signed leases first. */
export async function deleteApplicant(api: APIRequestContext, id: string): Promise<void> {
  const res = await api.delete(`/test/applicants/${id}`);
  if (!res.ok()) throw new Error(`deleteApplicant failed: ${res.status()} ${await res.text()}`);
}
