import type { ListingsPagesState } from "@mybookkeeper/api-client/types/listing/listings-pages-state";
import type { SheetOption } from "@platform/mobile";

/** The host's listings as choices for a picker, a page at a time. */
export interface ListingChoices extends ListingsPagesState {
  options: SheetOption<string>[];
  /** Asks for the next page, unless there is none, one is on its way, or the last ask failed (a retry is the person's call). */
  loadMoreIfAny: () => void;
}
