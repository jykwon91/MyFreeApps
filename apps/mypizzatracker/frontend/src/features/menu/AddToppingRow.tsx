import { useState } from "react";
import { LoadingButton, FormField, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import {
  useCreateToppingMutation,
} from "@/store/menuApi";
import type { ToppingTypeCreateBody } from "@/types/menu/menu";
import type { AddToppingRowProps } from "@/types/menu/AddToppingRowProps";

export default function AddToppingRow({ onDone }: AddToppingRowProps) {
  const [body, setBody] = useState<ToppingTypeCreateBody>({
    name: "",
    price_delta: "0.00",
  });
  const [createTopping, { isLoading }] = useCreateToppingMutation();

  const submit = async () => {
    try {
      await createTopping(body).unwrap();
      showSuccess("Topping added");
      onDone();
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to add topping");
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end mb-3 p-3 rounded border bg-muted/30">
      <FormField label="Name" required>
        {(field) => (
          <input
            type="text"
            value={body.name}
            onChange={(e) => setBody({ ...body, name: e.target.value })}
            placeholder="Red Bell Pepper"
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
            value={body.price_delta ?? "0.00"}
            onChange={(e) =>
              setBody({ ...body, price_delta: e.target.value })
            }
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
        disabled={!body.name.trim()}
      >
        Add
      </LoadingButton>
    </div>
  );
}
