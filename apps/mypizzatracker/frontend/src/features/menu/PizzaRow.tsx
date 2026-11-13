import { useState } from "react";
import { Button, LoadingButton, FormField, ConfirmDialog, StatusBadge, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import { Trash2, Pencil, Check, X } from "lucide-react";
import {
  useUpdatePizzaMutation,
  useDeletePizzaMutation,
} from "@/store/menuApi";
import type { PizzaTypeUpdateBody } from "@/types/menu/menu";
import type { PizzaRowProps } from "@/types/menu/PizzaRowProps";
import { formatMoney } from "@/lib/formatMoney";

export default function PizzaRow({ pizza }: PizzaRowProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [updatePizza, { isLoading: isSaving }] = useUpdatePizzaMutation();
  const [deletePizza, { isLoading: isDeleting }] = useDeletePizzaMutation();
  const [draft, setDraft] = useState<PizzaTypeUpdateBody>({
    name: pizza.name,
    price: pizza.price,
    description: pizza.description ?? "",
  });

  const toggleActive = async () => {
    try {
      await updatePizza({
        id: pizza.id,
        body: { active: !pizza.active },
      }).unwrap();
      showSuccess(pizza.active ? "86'd" : "Re-activated");
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to toggle");
    }
  };

  const save = async () => {
    try {
      await updatePizza({
        id: pizza.id,
        body: {
          name: draft.name,
          price: draft.price,
          description: draft.description || null,
        },
      }).unwrap();
      showSuccess("Updated");
      setEditing(false);
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to update");
    }
  };

  const onDelete = async () => {
    try {
      await deletePizza(pizza.id).unwrap();
      showSuccess("Pizza deleted");
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to delete");
    }
  };

  if (editing) {
    return (
      <li className="py-3 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
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
        <FormField label="Price">
          {(field) => (
            <input
              type="number"
              step="0.01"
              min="0"
              value={draft.price ?? ""}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              className="w-full px-3 py-2 rounded border bg-background"
              {...field}
            />
          )}
        </FormField>
        <FormField label="Description">
          {(field) => (
            <input
              type="text"
              value={draft.description ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
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
      <div className="flex items-center gap-3 min-w-0">
        <span className={pizza.active ? "font-medium" : "font-medium text-muted-foreground line-through"}>
          {pizza.name}
        </span>
        <span className="text-sm text-muted-foreground">
          ${formatMoney(pizza.price)}
        </span>
        {pizza.description ? (
          <span className="text-xs text-muted-foreground truncate max-w-xs">
            {pizza.description}
          </span>
        ) : null}
        {!pizza.active ? (
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
          {pizza.active ? "86" : "Un-86"}
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
        title={`Delete ${pizza.name}?`}
        description="This removes the pizza type entirely. Use the 86 toggle if you just want to hide it temporarily."
        confirmLabel="Delete"
        variant="destructive"
        isLoading={isDeleting}
      />
    </li>
  );
}
