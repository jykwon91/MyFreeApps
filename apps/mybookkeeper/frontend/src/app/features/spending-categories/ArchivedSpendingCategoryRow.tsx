import { Button } from "@platform/ui";
import { showError, showSuccess } from "@platform/ui";
import type { SpendingCategory } from "@mybookkeeper/api-client/types/spending-category/SpendingCategory";
import { useUnarchiveSpendingCategoryMutation } from "@mybookkeeper/api-client/store/spendingCategoriesApi";
import { rejectedWriteDetail } from "@mybookkeeper/api-client/utils/rejectedWriteDetail";
import { SPENDING_CATEGORY_MESSAGES as MSG } from "@/shared/lib/spending-category-messages";

interface ArchivedSpendingCategoryRowProps {
  category: SpendingCategory;
}

export default function ArchivedSpendingCategoryRow({ category }: ArchivedSpendingCategoryRowProps) {
  const [unarchive, { isLoading }] = useUnarchiveSpendingCategoryMutation();

  async function handleUnarchive() {
    try {
      await unarchive(category.id).unwrap();
      showSuccess(MSG.unarchiveSuccess);
    } catch (err) {
      showError(rejectedWriteDetail(err, "Could not restore this category"));
    }
  }

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg opacity-60">
      <span className="flex-1 text-sm line-through">{category.name}</span>
      <span className="text-xs text-muted-foreground">{MSG.archived}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void handleUnarchive()}
        disabled={isLoading}
        data-testid={`restore-btn-${category.id}`}
      >
        {MSG.unarchive}
      </Button>
    </div>
  );
}
