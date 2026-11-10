import type { WelcomeManualSectionResponse } from "../types/welcome-manual/welcome-manual-section-response";

/**
 * Sections a guest sees for a scope: the shared link (SHARED_ROOM_OPTION) shows only sections shared
 * by every room, while a room's emailed guide adds that room's own sections.
 */
export function sectionsForScope(
  sections: readonly WelcomeManualSectionResponse[],
  scope: string,
): WelcomeManualSectionResponse[] {
  return sections.filter((section) => !section.room_id || section.room_id === scope);
}
