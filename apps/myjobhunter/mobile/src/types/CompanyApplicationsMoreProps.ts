export interface CompanyApplicationsMoreProps {
  shown: number;
  total: number;
  isLoading: boolean;
  isError: boolean;
  onLoadMore: () => void;
}
