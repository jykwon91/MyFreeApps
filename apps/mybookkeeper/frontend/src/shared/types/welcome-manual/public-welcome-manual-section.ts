import type { PublicWelcomeManualSectionField } from "./public-welcome-manual-section-field";
import type { PublicWelcomeManualSectionImage } from "./public-welcome-manual-section-image";

/** A section as returned by the public (unauthenticated) guide endpoint. */
export interface PublicWelcomeManualSection {
  title: string;
  body: string | null;
  fields: PublicWelcomeManualSectionField[];
  images: PublicWelcomeManualSectionImage[];
}
