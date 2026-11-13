import { useState } from "react";
import { Button, LoadingButton, FormField, ConfirmDialog, StatusBadge, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import { Trash2, Pencil, Check, X } from "lucide-react";
import {
  useUpdateToppingMutation,
  useDeleteToppingMutation,
} from "@/store/menuApi";
import type { ToppingTypeUpdateBody } from "@/types/menu/menu";
import type { ToppingRowProps } from "@/types/menu/ToppingRowProps";
import { formatMoney } from "@/lib/formatMoney";

export default function ToppingRow({ topping }: ToppingRowProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [updateTopping, { isLoading: isSaving }] = useUpdateToppingMutation();
  const [deleteTopping, { isLoading: isDeleting }] = useDeleteToppingMutation();
  const [draft, setDraft] = useState<ToppingTypeUpdateBody>({
    name: topping.name,
    price_delta: topping.price_delta,
  });

  const toggleActive = async () => {
    try {
      await updateTopping({
        id: topping.id,
        body: { active: !topping.active },
      }).unwrap();
      showSuccess(topping.active ? "86'd" : "Re-activated");
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to toggle");
    }
  };

  const save = async () => {
    try {
      await updateTopping({
        id: topping.id,
        body: { name: draft.name, price_delta: draft.price_delta },
      }).unwrap();
      showSuccess("Updated");
      setEditing(false);
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to update");
    }
  };

  const onDelete = async () => {
    try {
      await deleteTopping(topping.id).unwrap();
      showSuccess("Topping deleted");
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to delete");
    }
  };

  if (editing) {
    return (
      <li className="py-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <FormField label="Name">
          {(field) => (
            <input
              type="text"
              value={draft.name ?? ""}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="w-full px-3 py-2 rounded border bg-background"
              {...field}
            />
          )}
        </FormField>
        <FormField label="Price delta">
          {(field) => (
            <input
              type="number"
              step="0.01"
              min="0"
              value={draft.price_delta ?? "0.00"}
              onChange={(e) =>
                setDraft({ ...draft, price_delta: e.target.value })
              }
              className="w-full px-3 py-2 rounded border bg-background"
              {...field}
            />
          )}
        </FormField>
        <div className="flex gap-2">
          <LoadingButton
            size="sm"
            isLoading={isSaving}
            onClick={save}
            disabled={!draft.name?.trim()}
            aria-label="Save"
          >
            <Check className="h-4 w-4" />
          </LoadingButton>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(false)}
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="py-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <span className={topping.active ? "font-medium" : "font-medium text-muted-foreground line-through"}>
          {topping.name}
        </span>
        <span className="text-sm text-muted-foreground">
          {Number(topping.price_delta) === 0
            ? "free"
            : `+$${formatMoney(topping.price_delta)}`}
        </span>
        {!topping.active ? (
          <StatusBadge tone="warning" label="86'd" />
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <LoadingButton
          size="sm"
          variant="ghost"
          isLoading={isSaving}
          onClick={toggleActive}
        >
          {topping.active ? "86" : "Un-86"}
        </LoadingButton>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditing(true)}
          aria-label="Edit"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirmDelete(true)}
          aria-label="Delete"
        >
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        title={`Delete ${topping.name}?`}
        description="This removes the topping entirely. Use the 86 toggle if you just want to hide it temporarily."
        confirmLabel="Delete"
        variant="destructive"
        isLoading={isDeleting}
      />
    </li>
  );
}
