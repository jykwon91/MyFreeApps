import type { ComponentPropsWithRef } from "react";
import { useListingsPages } from "@mybookkeeper/api-client/hooks/useListingsPages";
import ListPagesErrorAlert from "@/shared/components/ui/ListPagesErrorAlert";
import LoadMoreButton from "@/shared/components/ui/LoadMoreButton";
import { pagedListView } from "@/shared/lib/paged-list-view";

export interface ListingSelectProps extends Omit<ComponentPropsWithRef<"select">, "children"> {
  /** The first option, which stands for no listing chosen. */
  emptyLabel: string;
}

/**
 * A dropdown of the host's listings, every one of them: more load a page at a time under it.
 * The dropdown stays usable while they load or if they can't, so a form that links a listing
 * only optionally never gets stuck behind it; a failure shows an alert with Retry beneath it. Pass the select's own props (`id`, `value`,
 * `onChange`, a form `register` spread) straight through.
 */
export default function ListingSelect({ emptyLabel, ...selectProps }: ListingSelectProps) {
  const pages = useListingsPages({});
  const { mode, rows: listings } = pagedListView(pages, pages.listings);

  return (
    <div className="space-y-2 flex-1">
      <select {...selectProps} aria-busy={mode === "loading"}>
        <option value="">{emptyLabel}</option>
        {listings.map((listing) => (
          <option key={listing.id} value={listing.id}>
            {listing.title}
          </option>
        ))}
      </select>
      <ListPagesErrorAlert pages={pages} noun="listings" />
      <LoadMoreButton hasNextPage={pages.hasNextPage} isFetchingNextPage={pages.isFetchingNextPage} onLoadMore={pages.loadMore} />
    </div>
  );
}
