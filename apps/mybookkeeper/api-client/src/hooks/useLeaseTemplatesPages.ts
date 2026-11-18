import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListLeaseTemplatePagesInfiniteQuery } from "../store/leaseTemplatesApi";
import type { LeaseTemplatesPagesState } from "../types/lease/lease-templates-pages-state";

/** GET /lease-templates a page at a time. Shared by the website's template screens and, later, the phone's. */
export function useLeaseTemplatesPages(): LeaseTemplatesPagesState {
  const { items, ...pages } = useInfinitePages(useListLeaseTemplatePagesInfiniteQuery());
  return { ...pages, templates: items };
}
