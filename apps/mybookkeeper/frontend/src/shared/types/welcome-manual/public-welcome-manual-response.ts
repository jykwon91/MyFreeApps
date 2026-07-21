import type { PublicWelcomeManualPlace } from "./public-welcome-manual-place";
import type { PublicWelcomeManualSection } from "./public-welcome-manual-section";

/**
 * Body returned by ``POST /public/welcome-manuals/:token/unlock`` on a
 * correct PIN — the read-only guest view of a welcome manual. Intentionally
 * excludes every admin-only field (ids, organization/user/property ids,
 * timestamps) since a guest never needs them.
 */
export interface PublicWelcomeManualResponse {
  title: string;
  sections: PublicWelcomeManualSection[];
  places: PublicWelcomeManualPlace[];
}
