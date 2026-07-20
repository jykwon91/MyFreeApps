import type { WelcomeManualSectionFieldResponse } from "./welcome-manual-section-field-response";
import type { WelcomeManualSectionImageResponse } from "./welcome-manual-section-image-response";

/**
 * Mirrors backend `WelcomeManualSectionResponse`. ``fields`` and ``images`` are
 * populated on the full-manual read paths; section-mutation responses (add /
 * update / reorder) return empty lists and the frontend refetches the manual.
 */
export interface WelcomeManualSectionResponse {
  id: string;
  manual_id: string;
  title: string;
  body: string | null;
  display_order: number;
  fields: WelcomeManualSectionFieldResponse[];
  images: WelcomeManualSectionImageResponse[];
  created_at: string;
  updated_at: string;
}
