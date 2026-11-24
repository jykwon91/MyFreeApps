import { useState } from "react";
import { Button } from "@platform/ui";
import { showError, showSuccess } from "@platform/ui";
import { useCreateSpendingCategoryMutation } from "@mybookkeeper/api-client/store/spendingCategoriesApi";
import { rejectedWriteDetail } from "@mybookkeeper/api-client/utils/rejectedWriteDetail";
import { SPENDING_CATEGORY_MESSAGES as MSG } from "@/shared/lib/spending-category-messages";

export default function AddSpendingCategoryForm() {
  const [name, setName] = useState("");
  const [createCategory, { isLoading }] = useCreateSpendingCategoryMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createCategory({ name: trimmed }).unwrap();
      showSuccess(MSG.addSuccess);
      setName("");
    } catch (err) {
      showError(rejectedWriteDetail(err, MSG.conflict));
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={100}
        className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder={MSG.addPlaceholder}
        data-testid="add-category-name-input"
      />
      <Button
        type="submit"
        variant="primary"
        size="sm"
        disabled={isLoading || !name.trim()}
        data-testid="add-category-submit-button"
      >
        {MSG.add}
      </Button>
    </form>
  );
}
