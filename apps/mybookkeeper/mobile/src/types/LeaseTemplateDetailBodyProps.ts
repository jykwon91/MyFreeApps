import type { LeaseTemplateDetail } from "@mybookkeeper/api-client/types/lease/lease-template-detail";
import type { ReactElement } from "react";
import type { RefreshControlProps } from "react-native";

export interface LeaseTemplateDetailBodyProps {
  template: LeaseTemplateDetail;
  canWrite: boolean;
  /** A reload failed, so what's shown is what was last loaded. */
  hasStaleData: boolean;
  refreshControl: ReactElement<RefreshControlProps>;
  onDeleted: () => void;
}
