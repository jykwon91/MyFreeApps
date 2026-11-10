import type { WelcomeManualSectionFieldResponse } from "../types/welcome-manual/welcome-manual-section-field-response";

/**
 * The fields a guest sees. A label with no value still shows, since the host may mean it as a heading
 * or be part-way through filling it in; only a field with neither is left out.
 */
export function previewFields(fields: readonly WelcomeManualSectionFieldResponse[]): WelcomeManualSectionFieldResponse[] {
  return fields.filter((field) => field.label.trim() !== "" || (field.value ?? "").trim() !== "");
}
