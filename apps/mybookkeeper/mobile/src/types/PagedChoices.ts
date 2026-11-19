import type { SheetOption } from "@platform/mobile";
import type { PagedListPages } from "./PagedListPages";

/** A paged list's rows as choices for a picker, a page at a time, beside the list's own paging state. */
export type PagedChoices<Pages extends PagedListPages> = Pages & {
  options: SheetOption<string>[];
  /** Asks for the next page, unless there is none, one is on its way, or the last ask failed (a retry is the person's call). */
  loadMoreIfAny: () => void;
};
