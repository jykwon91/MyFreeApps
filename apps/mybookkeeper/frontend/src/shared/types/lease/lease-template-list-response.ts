import type { LeaseTemplateSummary } from "@/shared/types/lease/lease-template-summary";

export interface LeaseTemplateListResponse {
  items: LeaseTemplateSummary[];
  total: number;
  has_more: boolean;
}
