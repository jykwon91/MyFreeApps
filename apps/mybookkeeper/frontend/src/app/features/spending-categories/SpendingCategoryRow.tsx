import { useState } from "react";
import { Button } from "@platform/ui";
import { showError, showSuccess } from "@platform/ui";
import type { SpendingCategory } from "@mybookkeeper/api-client/types/spending-category/SpendingCategory";
import { useArchiveSpendingCategoryMutation, useUpdateSpendingCategoryMutation } from "@mybookkeeper/api-client/store/spendingCategoriesApi";
import { rejectedWriteDetail } from "@mybookkeeper/api-client/utils/rejectedWriteDetail";
import { SPENDING_CATEGORY_MESSAGES as MSG } from "@/shared/lib/spending-category-messages";

interface SpendingCategoryRowProps {
  category: SpendingCategory;
}

export default function SpendingCategoryRow({ category }: SpendingCategoryRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [updateCategory, { isLoading: isRenaming }] = useUpdateSpendingCategoryMutation();
  const [archiveCategory, { isLoading: isArchiving }] = useArchiveSpendingCategoryMutation();

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === category.name) {
      setEditing(false);
      return;
    }
    try {
      await updateCategory({ categoryId: category.id, name: trimmed }).unwrap();
      showSuccess(MSG.renameSuccess);
      setEditing(false);
    } catch (err) {
      showError(rejectedWriteDetail(err, MSG.conflict));
    }
  }

  async function handleArchive() {
    try {
      await archiveCategory(category.id).unwrap();
      showSuccess(MSG.archiveSuccess);
    } catch (err) {
      showError(rejectedWriteDetail(err, MSG.defaultArchiveError));
    }
  }

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-card/50">
      {editing ? (
        <form onSubmit={(e) => void handleRename(e)} className="flex-1 flex items-center gap-2">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={MSG.renamePlaceholder}
          />
          <Button type="submit" variant="primary" size="sm" disabled={isRenaming}>
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { setName(category.name); setEditing(false); }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <span className="flex-1 text-sm">{category.name}</span>
          <div className="flex items-center gap-2">
            {category.is_default ? (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{MSG.defaultBadge}</span>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Rename
            </Button>
            {!category.is_default ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleArchive()}
                disabled={isArchiving}
                data-testid={`archive-btn-${category.id}`}
              >
                {MSG.archive}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
