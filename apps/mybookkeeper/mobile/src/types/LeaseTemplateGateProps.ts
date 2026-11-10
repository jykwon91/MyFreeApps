import type { LeaseTemplateDetail } from "@mybookkeeper/api-client/types/lease/lease-template-detail";
import type { ReactElement } from "react";

export interface LeaseTemplateGateProps {
  id: string;
  /** For screens that change things: a viewer sees why they can't, not a form that will fail. */
  requireWrite?: boolean;
  children: (template: LeaseTemplateDetail) => ReactElement;
}
