import type { WelcomeManualSectionResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-response";
import type { ReactNode } from "react";
import type { WelcomeManualView } from "./WelcomeManualView";

export interface WelcomeManualSectionGateProps {
  manualId: string;
  sectionId: string;
  requireWrite?: boolean;
  isLeaving?: boolean;
  children: (view: WelcomeManualView, section: WelcomeManualSectionResponse) => ReactNode;
}
