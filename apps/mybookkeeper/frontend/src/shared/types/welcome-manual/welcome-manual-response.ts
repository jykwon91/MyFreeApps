import type { WelcomeManualPlaceResponse } from "./welcome-manual-place-response";
import type { WelcomeManualSectionResponse } from "./welcome-manual-section-response";

/**
 * Mirrors backend `WelcomeManualResponse` — the full detail payload with
 * ordered sections (each carrying its ordered images) and the flat list of
 * "Where to Eat" places parented directly to the manual.
 */
export interface WelcomeManualResponse {
  id: string;
  organization_id: string;
  user_id: string;
  property_id: string | null;
  title: string;
  intro_text: string | null;
  sections: WelcomeManualSectionResponse[];
  places: WelcomeManualPlaceResponse[];
  /** Non-null once a PIN-protected public share link has been created. */
  share_token: string | null;
  /** Current access PIN for the share link. Null when not shared. */
  share_pin: string | null;
  created_at: string;
  updated_at: string;
}
