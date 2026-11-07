import type { APIRequestContext } from "@playwright/test";
import type { SeedInquiryPayload } from "./seed-inquiry-payload";

/** Seeds an inquiry through the test-only endpoint and returns its id. Source defaults to "direct", received_at to now. */
export async function seedInquiry(
  api: APIRequestContext,
  payload: SeedInquiryPayload = {},
): Promise<string> {
  const res = await api.post("/test/seed-inquiry", {
    data: {
      ...payload,
      source: payload.source ?? "direct",
      received_at: payload.received_at ?? new Date().toISOString(),
    },
  });
  if (!res.ok()) {
    throw new Error(`seedInquiry failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

export async function deleteInquiry(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/inquiries/${id}`).catch(() => {});
}
