import { LoadingButton } from "@platform/ui";

export interface LoadMoreButtonProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

/** Under a paged list: the Load more button, while there is another page. Failures show in the list's error alert. */
export default function LoadMoreButton({ hasNextPage, isFetchingNextPage, onLoadMore }: LoadMoreButtonProps) {
  if (!hasNextPage) return null;
  return (
    <div className="flex justify-center">
      <LoadingButton
        type="button"
        variant="secondary"
        isLoading={isFetchingNextPage}
        loadingText="Loading..."
        onClick={onLoadMore}
        data-testid="load-more-button"
      >
        Load more
      </LoadingButton>
    </div>
  );
}
