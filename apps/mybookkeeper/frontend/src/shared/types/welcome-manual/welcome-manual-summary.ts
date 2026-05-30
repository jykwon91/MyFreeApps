/**
 * Mirrors backend `WelcomeManualSummary` Pydantic schema (GET /welcome-manuals
 * list items). ``section_count`` is computed server-side, not a column.
 */
export interface WelcomeManualSummary {
  id: string;
  title: string;
  property_id: string | null;
  section_count: number;
  created_at: string;
  updated_at: string;
}
