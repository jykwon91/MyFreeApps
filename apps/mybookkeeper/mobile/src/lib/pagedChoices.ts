import type { SheetOption } from "@platform/mobile";
import type { PagedChoices } from "../types/PagedChoices";
import type { PagedListPages } from "../types/PagedListPages";
import { canLoadMore } from "./canLoadMore";

/** A paged list's choices for a picker: its `options`, and a `loadMoreIfAny` for the end of the list. */
export function pagedChoices<Pages extends PagedListPages>(pages: Pages, options: SheetOption<string>[]): PagedChoices<Pages> {
  return {
    ...pages,
    options,
    loadMoreIfAny: () => {
      if (canLoadMore(pages)) pages.loadMore();
    },
  };
}
