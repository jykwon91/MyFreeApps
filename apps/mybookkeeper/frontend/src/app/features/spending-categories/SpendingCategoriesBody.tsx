import type { SpendingCategoryListResponse } from "@mybookkeeper/api-client/types/spending-category/SpendingCategoryListResponse";
import { SPENDING_CATEGORY_MESSAGES as MSG } from "@/shared/lib/spending-category-messages";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import AddSpendingCategoryForm from "./AddSpendingCategoryForm";
import ArchivedSpendingCategoryRow from "./ArchivedSpendingCategoryRow";
import SpendingCategoriesSkeleton from "./SpendingCategoriesSkeleton";
import SpendingCategoryRow from "./SpendingCategoryRow";

interface SpendingCategoriesBodyProps {
  data: SpendingCategoryListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
}

export default function SpendingCategoriesBody({ data, isLoading, isError, isFetching, onRetry }: SpendingCategoriesBodyProps) {
  if (isLoading) return <SpendingCategoriesSkeleton />;
  if (isError || !data) return <LoadErrorAlert message="Could not load categories" isRetrying={isFetching} onRetry={onRetry} />;

  const live = data?.items.filter((c) => !c.archived_at) ?? [];
  const archived = data?.items.filter((c) => c.archived_at != null) ?? [];

  return (
    <div className="space-y-6">
      <AddSpendingCategoryForm />

      {live.length === 0 && archived.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">{MSG.empty}</p>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {live.map((c) => (
            <SpendingCategoryRow key={c.id} category={c} />
          ))}
          {archived.map((c) => (
            <ArchivedSpendingCategoryRow key={c.id} category={c} />
          ))}
        </div>
      )}
    </div>
  );
}
