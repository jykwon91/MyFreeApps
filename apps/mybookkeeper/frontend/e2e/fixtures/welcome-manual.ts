import type { APIRequestContext } from "@playwright/test";

interface WelcomeManualCreateInput {
  title?: string;
  property_id?: string | null;
  intro_text?: string | null;
  seed_default_sections?: boolean;
}

interface CreatedManual {
  id: string;
  title: string;
  sections: Array<{ id: string; title: string; display_order: number }>;
  places: Array<{ id: string; name: string; display_order: number }>;
}

/**
 * Create a welcome manual via the public API for E2E seeding. There is no
 * test-helper seed endpoint for this domain — the public POST is the create
 * path the UI uses, so seeding through it keeps the fixture honest.
 */
export async function createWelcomeManual(
  api: APIRequestContext,
  overrides: WelcomeManualCreateInput = {},
): Promise<CreatedManual> {
  const body = {
    title: overrides.title ?? "E2E Welcome Manual",
    property_id: overrides.property_id ?? null,
    intro_text: overrides.intro_text ?? null,
    seed_default_sections: overrides.seed_default_sections ?? true,
  };
  const res = await api.post("/welcome-manuals", { data: body });
  if (!res.ok()) {
    throw new Error(`createWelcomeManual failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

export async function deleteWelcomeManual(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/welcome-manuals/${id}`).catch(() => {});
}
