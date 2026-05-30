import type { WelcomeManualSectionResponse } from "./welcome-manual-section-response";

/**
 * Mirrors backend `WelcomeManualResponse` — the full detail payload with
 * ordered sections (each carrying its ordered images).
 */
export interface WelcomeManualResponse {
  id: string;
  organization_id: string;
  user_id: string;
  property_id: string | null;
  title: string;
  intro_text: string | null;
  sections: WelcomeManualSectionResponse[];
  created_at: string;
  updated_at: string;
}
