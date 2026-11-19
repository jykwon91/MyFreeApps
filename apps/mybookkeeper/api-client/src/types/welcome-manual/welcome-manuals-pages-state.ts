import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";
import type { WelcomeManualSummary } from "./welcome-manual-summary";

/** A paged welcome manuals list, as a screen needs it: `manuals` is every loaded row, in the server's order. */
export interface WelcomeManualsPagesState extends Omit<InfinitePagesResult<WelcomeManualSummary>, "items"> {
  manuals: WelcomeManualSummary[];
}
