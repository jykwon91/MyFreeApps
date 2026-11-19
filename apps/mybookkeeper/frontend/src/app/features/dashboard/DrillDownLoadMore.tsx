import LoadMoreButton from "@/shared/components/ui/LoadMoreButton";

export interface DrillDownLoadMoreProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

/** Under the drill-down's rows while the server has more: Load more asks for the next page. */
export default function DrillDownLoadMore({ hasNextPage, isFetchingNextPage, onLoadMore }: DrillDownLoadMoreProps) {
  if (!hasNextPage) return null;
  return (
    <div className="px-5 py-4 border-t">
      <LoadMoreButton hasNextPage={hasNextPage} isFetchingNextPage={isFetchingNextPage} onLoadMore={onLoadMore} />
    </div>
  );
}
