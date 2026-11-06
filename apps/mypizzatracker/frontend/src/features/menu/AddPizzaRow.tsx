import { useState } from "react";
import { LoadingButton, FormField, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import {
  useCreatePizzaMutation,
} from "@/store/menuApi";
import type { PizzaTypeCreateBody } from "@/types/menu/menu";
import type { AddPizzaRowProps } from "@/types/menu/AddPizzaRowProps";

export default function AddPizzaRow({ onDone }: AddPizzaRowProps) {
  const [body, setBody] = useState<PizzaTypeCreateBody>({
    name: "",
    price: "0.00",
    description: "",
  });
  const [createPizza, { isLoading }] = useCreatePizzaMutation();

  const submit = async () => {
    try {
      await createPizza({
        ...body,
        description: body.description || null,
      }).unwrap();
      showSuccess("Pizza added");
      onDone();
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to add pizza");
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end mb-3 p-3 rounded border bg-muted/30">
      <FormField label="Name" required>
        {(field) => (
          <input
            type="text"
            value={body.name}
            onChange={(e) => setBody({ ...body, name: e.target.value })}
            placeholder="La Clasica"
            className="w-full px-3 py-2 rounded border bg-background"
            {...field}
          />
        )}
      </FormField>
      <FormField label="Price" required>
        {(field) => (
          <input
            type="number"
            step="0.01"
            min="0"
            value={body.price}
            onChange={(e) => setBody({ ...body, price: e.target.value })}
            className="w-full px-3 py-2 rounded border bg-background"
            {...field}
          />
        )}
      </FormField>
      <FormField label="Description">
        {(field) => (
          <input
            type="text"
            value={body.description ?? ""}
            onChange={(e) => setBody({ ...body, description: e.target.value })}
            placeholder="optional"
            className="w-full px-3 py-2 rounded border bg-background"
            {...field}
          />
        )}
      </FormField>
      <LoadingButton
        size="sm"
        isLoading={isLoading}
        loadingText="Adding..."
        onClick={submit}
        disabled={!body.name.trim() || Number(body.price) < 0}
      >
        Add
      </LoadingButton>
    </div>
  );
}
