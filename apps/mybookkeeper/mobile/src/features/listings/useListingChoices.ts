import { useListingsPages } from "@mybookkeeper/api-client/hooks/useListingsPages";
import type { ListingsPagesState } from "@mybookkeeper/api-client/types/listing/listings-pages-state";
import { useMemo } from "react";
import { pagedChoices } from "../../lib/pagedChoices";
import type { PagedChoices } from "../../types/PagedChoices";

/** Every listing the host has, a page at a time, for the pickers that link one. */
export function useListingChoices(): PagedChoices<ListingsPagesState> {
  const pages = useListingsPages({});
  const { listings } = pages;
  const options = useMemo(() => listings.map((listing) => ({ value: listing.id, label: listing.title })), [listings]);
  return pagedChoices(pages, options);
}
