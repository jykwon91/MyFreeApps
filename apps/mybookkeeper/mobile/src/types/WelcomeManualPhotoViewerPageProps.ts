import type { WelcomeManualSectionImageResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-image-response";

export interface WelcomeManualPhotoViewerPageProps {
  image: WelcomeManualSectionImageResponse;
  index: number;
  total: number;
  width: number;
}
