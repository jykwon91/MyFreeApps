import { useState } from "react";
import { Button, LoadingButton, ConfirmDialog, StatusBadge, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import { Trash2, Pencil } from "lucide-react";
import {
  useUpdatePizzaMutation,
  useDeletePizzaMutation,
} from "@/store/menuApi";
import type { PizzaRowProps } from "@/types/menu/PizzaRowProps";
import { formatMoney } from "@/lib/formatMoney";
import PizzaRowEditor from "./PizzaRowEditor";

export default function PizzaRow({ pizza }: PizzaRowProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [updatePizza, { isLoading: isSaving }] = useUpdatePizzaMutation();
  const [deletePizza, { isLoading: isDeleting }] = useDeletePizzaMutation();

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

  const onDelete = async () => {
    try {
      await deletePizza(pizza.id).unwrap();
      showSuccess("Pizza deleted");
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to delete");
    }
  };

  if (editing) {
    return <PizzaRowEditor pizza={pizza} onClose={() => setEditing(false)} />;
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
