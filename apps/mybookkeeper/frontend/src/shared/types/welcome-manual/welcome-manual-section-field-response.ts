/**
 * Mirrors backend `WelcomeManualSectionFieldResponse`. A field is a simple
 * label/value pair (e.g. "Wi-Fi network" → "Lakeview") ordered within a
 * section. ``value`` is nullable — a label with no value yet is allowed.
 */
export interface WelcomeManualSectionFieldResponse {
  id: string;
  section_id: string;
  label: string;
  value: string | null;
  display_order: number;
  created_at: string;
}
