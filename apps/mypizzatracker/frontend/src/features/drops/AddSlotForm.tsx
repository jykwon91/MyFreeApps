import { useState } from "react";
import { Button, LoadingButton, FormField, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import {
  useAddSlotMutation,
} from "@/store/dropsApi";
import type { SlotCreateBody } from "@/types/drop/drop";
import { ensureSeconds } from "./dropTime";
import type { AddSlotFormProps } from "@/types/drop/AddSlotFormProps";

export default function AddSlotForm({ dropId, onDone }: AddSlotFormProps) {
  const [body, setBody] = useState<SlotCreateBody>({
    pickup_time: "12:00",
    max_pizzas: 6,
  });
  const [addSlot, { isLoading }] = useAddSlotMutation();

  const submit = async () => {
    try {
      await addSlot({
        dropId,
        body: { ...body, pickup_time: ensureSeconds(body.pickup_time) },
      }).unwrap();
      showSuccess("Slot added");
      onDone();
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to add slot");
    }
  };

  return (
    <div className="flex items-end gap-2 mt-2">
      <FormField label="Pickup time">
        {(field) => (
          <input
            type="time"
            value={body.pickup_time}
            onChange={(e) => setBody({ ...body, pickup_time: e.target.value })}
            className="px-3 py-2 rounded border bg-background"
            {...field}
          />
        )}
      </FormField>
      <FormField label="Max pizzas">
        {(field) => (
          <input
            type="number"
            min={1}
            value={body.max_pizzas}
            onChange={(e) =>
              setBody({ ...body, max_pizzas: Number(e.target.value) || 0 })
            }
            className="px-3 py-2 rounded border bg-background w-24"
            {...field}
          />
        )}
      </FormField>
      <LoadingButton
        size="sm"
        isLoading={isLoading}
        loadingText="Adding..."
        onClick={submit}
        disabled={body.max_pizzas <= 0}
      >
        Add
      </LoadingButton>
      <Button size="sm" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </div>
  );
}
