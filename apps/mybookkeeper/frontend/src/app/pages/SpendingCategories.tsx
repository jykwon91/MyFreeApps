import { useListSpendingCategoriesQuery } from "@mybookkeeper/api-client/store/spendingCategoriesApi";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import SpendingCategoriesBody from "@/app/features/spending-categories/SpendingCategoriesBody";
import { SPENDING_CATEGORY_MESSAGES as MSG } from "@/shared/lib/spending-category-messages";

/**
 * Personal spending categories — the user-managed list shared by every member
 * of the org.  Keeps personal spending labelled separately from rental/business
 * tax categories.
 */
export default function SpendingCategories() {
  const query = useListSpendingCategoriesQuery({ include_archived: true });

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title={MSG.pageTitle}
        subtitle={MSG.pageSubtitle}
      />

      <SpendingCategoriesBody
        data={query.data}
        isLoading={query.isLoading}
        isError={query.isError}
        isFetching={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    </div>
  );
}
