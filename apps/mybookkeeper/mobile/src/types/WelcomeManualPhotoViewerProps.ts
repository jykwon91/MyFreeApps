import type { WelcomeManualSectionImageResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-image-response";

export interface WelcomeManualPhotoViewerProps {
  images: readonly WelcomeManualSectionImageResponse[];
  /** The photo the viewer opens on. */
  startIndex: number;
  onClose: () => void;
}
