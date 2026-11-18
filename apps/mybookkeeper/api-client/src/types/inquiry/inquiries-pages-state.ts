import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";
import type { InquirySummary } from "./inquiry-summary";

/** A paged inquiries list, as a screen needs it: `inquiries` is every loaded row, in the server's order. */
export interface InquiriesPagesState extends Omit<InfinitePagesResult<InquirySummary>, "items"> {
  inquiries: InquirySummary[];
}
