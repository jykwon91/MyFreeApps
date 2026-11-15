import { useState } from "react";
import { Button, LoadingButton, FormField, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import { Check, X } from "lucide-react";
import { useUpdateToppingMutation } from "@/store/menuApi";
import type { ToppingTypeUpdateBody } from "@/types/menu/menu";
import type { ToppingRowEditorProps } from "@/types/menu/ToppingRowEditorProps";

/** Mounted only while editing, so its draft always starts from the current topping. */
export default function ToppingRowEditor({ topping, onClose }: ToppingRowEditorProps) {
  const [updateTopping, { isLoading: isSaving }] = useUpdateToppingMutation();
  const [draft, setDraft] = useState<ToppingTypeUpdateBody>({
    name: topping.name,
    price_delta: topping.price_delta,
  });

  const save = async () => {
    try {
      await updateTopping({
        id: topping.id,
        body: { name: draft.name, price_delta: draft.price_delta },
      }).unwrap();
      showSuccess("Updated");
      onClose();
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to update");
    }
  };

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
            onChange={(e) => setDraft({ ...draft, price_delta: e.target.value })}
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
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}
