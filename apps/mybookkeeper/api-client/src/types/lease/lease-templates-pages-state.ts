import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";
import type { LeaseTemplateSummary } from "./lease-template-summary";

/** A paged lease templates list, as a screen needs it: `templates` is every loaded row, in the server's order. */
export interface LeaseTemplatesPagesState extends Omit<InfinitePagesResult<LeaseTemplateSummary>, "items"> {
  templates: LeaseTemplateSummary[];
}
