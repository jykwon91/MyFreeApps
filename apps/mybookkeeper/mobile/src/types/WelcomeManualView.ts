import type { WelcomeManualResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-response";
import type { ReactElement } from "react";
import type { RefreshControlProps } from "react-native";

/** One loaded manual, and how a screen pulls it to refresh. */
export interface WelcomeManualView {
  manual: WelcomeManualResponse;
  refreshControl: ReactElement<RefreshControlProps>;
}
