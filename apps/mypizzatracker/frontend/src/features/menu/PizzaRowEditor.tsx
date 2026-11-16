import { useState } from "react";
import { Button, LoadingButton, FormField, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import { Check, X } from "lucide-react";
import { useUpdatePizzaMutation } from "@/store/menuApi";
import type { PizzaTypeUpdateBody } from "@/types/menu/menu";
import type { PizzaRowEditorProps } from "@/types/menu/PizzaRowEditorProps";
import { validateMenuPrice } from "@/utils/validateMenuPrice";
import MenuPriceField from "./MenuPriceField";

/** Mounted only while editing, so its draft always starts from the current pizza. */
export default function PizzaRowEditor({ pizza, onClose }: PizzaRowEditorProps) {
  const [updatePizza, { isLoading: isSaving }] = useUpdatePizzaMutation();
  const [draft, setDraft] = useState<PizzaTypeUpdateBody>({
    name: pizza.name,
    price: pizza.price,
    description: pizza.description ?? "",
  });

  const priceError = validateMenuPrice(draft.price);

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
      onClose();
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to update");
    }
  };

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
      <MenuPriceField
        label="Price"
        value={draft.price ?? ""}
        onChange={(price) => setDraft({ ...draft, price })}
        error={priceError}
      />
      <FormField label="Description">
        {(field) => (
          <input
            type="text"
            value={draft.description ?? ""}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
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
          disabled={!draft.name?.trim() || priceError !== null}
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
