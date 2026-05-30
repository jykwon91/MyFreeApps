import type { WelcomeManualSectionImageResponse } from "./welcome-manual-section-image-response";

/**
 * Mirrors backend `WelcomeManualSectionResponse`. ``images`` is populated on
 * the full-manual read paths; section-mutation responses (add / update /
 * reorder) return an empty list and the frontend refetches the manual.
 */
export interface WelcomeManualSectionResponse {
  id: string;
  manual_id: string;
  title: string;
  body: string | null;
  display_order: number;
  images: WelcomeManualSectionImageResponse[];
  created_at: string;
  updated_at: string;
}
