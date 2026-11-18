import { useListingsPages } from "@mybookkeeper/api-client/hooks/useListingsPages";
import { useMemo } from "react";
import { canLoadMore } from "../../lib/canLoadMore";
import type { ListingChoices } from "../../types/ListingChoices";

/** Every listing the host has, a page at a time, for the pickers that link one. */
export function useListingChoices(): ListingChoices {
  const pages = useListingsPages({});
  const { listings, loadMore } = pages;
  const options = useMemo(() => listings.map((listing) => ({ value: listing.id, label: listing.title })), [listings]);

  return {
    ...pages,
    options,
    loadMoreIfAny: () => {
      if (canLoadMore(pages)) loadMore();
    },
  };
}
