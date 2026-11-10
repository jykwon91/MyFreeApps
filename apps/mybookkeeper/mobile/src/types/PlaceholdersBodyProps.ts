import type { LeaseTemplateDetail } from "@mybookkeeper/api-client/types/lease/lease-template-detail";

export interface PlaceholdersBodyProps {
  template: LeaseTemplateDetail;
  canWrite: boolean;
}
