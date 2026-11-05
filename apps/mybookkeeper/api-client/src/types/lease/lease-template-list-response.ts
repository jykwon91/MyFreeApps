import type { LeaseTemplateSummary } from "./lease-template-summary";

export interface LeaseTemplateListResponse {
  items: LeaseTemplateSummary[];
  total: number;
  has_more: boolean;
}
