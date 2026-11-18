import { Skeleton } from "@platform/mobile";
import { PICKER_LOAD_MESSAGES } from "../../constants/pickerLoad";
import type { ListingChoices } from "../../types/ListingChoices";
import PagedListFooter from "../shell/PagedListFooter";

/** Under a listing picker: a skeleton row while the next page of listings loads, or a retry when it failed. */
export default function ListingChoicesFooter({ choices }: { choices: ListingChoices }) {
  return (
    <PagedListFooter
      isLoadingMore={choices.isFetchingNextPage}
      loadMoreFailed={choices.isLoadMoreError}
      loadingLabel={PICKER_LOAD_MESSAGES.loadingMoreListings}
      onRetry={choices.loadMore}
      skeletonRow={<Skeleton height={56} />}
    />
  );
}
