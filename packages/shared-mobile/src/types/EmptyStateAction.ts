export interface EmptyStateAction {
  label: string;
  onPress: () => void | Promise<void>;
  isLoading?: boolean;
}
