import { useState } from "react";
import { Button } from "@platform/ui";
import { Plus } from "lucide-react";
import SlotRow from "./SlotRow";
import AddSlotForm from "./AddSlotForm";
import type { SlotEditorProps } from "@/types/drop/SlotEditorProps";

export default function SlotEditor({ drop }: SlotEditorProps) {
  const editable = drop.status !== "closed";
  const [showAddSlot, setShowAddSlot] = useState(false);

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Pickup slots</h3>
        {editable ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAddSlot((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add slot
          </Button>
        ) : null}
      </div>
      {drop.slots.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No slots yet.{" "}
          {editable ? "Add at least one before activating." : ""}
        </p>
      ) : (
        <ul className="space-y-1">
          {drop.slots.map((slot) => (
            <SlotRow
              key={slot.id}
              dropId={drop.id}
              slot={slot}
              editable={editable}
            />
          ))}
        </ul>
      )}
      {showAddSlot && editable ? (
        <AddSlotForm
          dropId={drop.id}
          onDone={() => setShowAddSlot(false)}
        />
      ) : null}
    </div>
  );
}
