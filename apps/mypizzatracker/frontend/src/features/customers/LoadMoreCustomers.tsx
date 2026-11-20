import { LoadingButton } from "@platform/ui";

interface LoadMoreCustomersProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  failed: boolean;
  onLoadMore: () => void;
}

/** Under the list: Load more while there is another page; if that page failed, says so and the same button retries. */
export default function LoadMoreCustomers({ hasNextPage, isFetchingNextPage, failed, onLoadMore }: LoadMoreCustomersProps) {
  if (!hasNextPage) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      {failed && !isFetchingNextPage ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load more customers. Try again.
        </p>
      ) : null}
      <LoadingButton
        type="button"
        variant="secondary"
        className="min-h-11"
        isLoading={isFetchingNextPage}
        loadingText="Loading..."
        onClick={onLoadMore}
      >
        Load more
      </LoadingButton>
    </div>
  );
}
