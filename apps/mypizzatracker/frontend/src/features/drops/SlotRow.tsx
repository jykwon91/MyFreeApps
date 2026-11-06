import { LoadingButton, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import { Trash2 } from "lucide-react";
import {
  useDeleteSlotMutation,
} from "@/store/dropsApi";
import { formatTime } from "./dropTime";
import type { SlotRowProps } from "@/types/drop/SlotRowProps";

export default function SlotRow({ dropId, slot, editable }: SlotRowProps) {
  const [deleteSlot, { isLoading }] = useDeleteSlotMutation();
  const onDelete = async () => {
    try {
      await deleteSlot({ dropId, slotId: slot.id }).unwrap();
      showSuccess("Slot removed");
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to remove slot");
    }
  };
  return (
    <li className="flex items-center justify-between gap-2 text-sm rounded px-2 py-1 hover:bg-muted/30">
      <span>
        {formatTime(slot.pickup_time)} -- {slot.max_pizzas} pizzas
      </span>
      {editable ? (
        <LoadingButton
          size="sm"
          variant="ghost"
          isLoading={isLoading}
          onClick={onDelete}
          aria-label="Remove slot"
        >
          <Trash2 className="h-3.5 w-3.5 text-red-500" />
        </LoadingButton>
      ) : null}
    </li>
  );
}
