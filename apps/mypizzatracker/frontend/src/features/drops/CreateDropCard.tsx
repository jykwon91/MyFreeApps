import { useState } from "react";
import { Card, Button, LoadingButton, FormField, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import {
  useCreateDropMutation,
} from "@/store/dropsApi";
import type { DropCreateBody } from "@/types/drop/drop";
import type { CreateDropCardProps } from "@/types/drop/CreateDropCardProps";
import { ensureSeconds } from "./dropTime";

export default function CreateDropCard({ onCreated }: CreateDropCardProps) {
  const [form, setForm] = useState<DropCreateBody>({
    date: new Date().toISOString().slice(0, 10),
    name: "",
    slot_window_start: "11:00",
    slot_window_end: "15:00",
  });
  const [createDrop, { isLoading }] = useCreateDropMutation();

  const submit = async () => {
    try {
      await createDrop({
        ...form,
        slot_window_start: ensureSeconds(form.slot_window_start),
        slot_window_end: ensureSeconds(form.slot_window_end),
      }).unwrap();
      showSuccess("Drop created");
      onCreated();
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to create drop");
    }
  };

  return (
    <Card title="New drop">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Name" required>
          {(field) => (
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Dec 25th"
              className="w-full px-3 py-2 rounded border bg-background"
              {...field}
            />
          )}
        </FormField>
        <FormField label="Date" required>
          {(field) => (
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full px-3 py-2 rounded border bg-background"
              {...field}
            />
          )}
        </FormField>
        <FormField label="Window start" required>
          {(field) => (
            <input
              type="time"
              value={form.slot_window_start}
              onChange={(e) =>
                setForm({ ...form, slot_window_start: e.target.value })
              }
              className="w-full px-3 py-2 rounded border bg-background"
              {...field}
            />
          )}
        </FormField>
        <FormField label="Window end" required>
          {(field) => (
            <input
              type="time"
              value={form.slot_window_end}
              onChange={(e) =>
                setForm({ ...form, slot_window_end: e.target.value })
              }
              className="w-full px-3 py-2 rounded border bg-background"
              {...field}
            />
          )}
        </FormField>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onCreated}>
          Cancel
        </Button>
        <LoadingButton
          isLoading={isLoading}
          loadingText="Creating..."
          onClick={submit}
          disabled={!form.name.trim()}
        >
          Create drop
        </LoadingButton>
      </div>
    </Card>
  );
}
