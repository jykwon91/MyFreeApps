export interface LoadMoreApplicationsProps {
  shown: number;
  total: number;
  hasNextPage: boolean;
  isLoading: boolean;
  isError: boolean;
  onLoadMore: () => void;
}
