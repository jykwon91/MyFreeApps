import { Select } from "@platform/ui";
import { formatPickupTime } from "@/features/service/formatPickupTime";
import type { MoveSelectProps } from "@/types/service/MoveSelectProps";

export default function MoveSelect({
  currentSlotId,
  slots,
  disabled,
  onMove,
}: MoveSelectProps) {
  if (slots.length <= 1) return null;
  return (
    <Select
      aria-label="Move order to slot"
      value={currentSlotId}
      onChange={(e) => onMove(e.target.value)}
      disabled={disabled}
      className="h-8 text-xs"
    >
      {slots.map((s) => (
        <option key={s.id} value={s.id}>
          Slot {formatPickupTime(s.pickup_time)}
          {s.id === currentSlotId ? " (current)" : ""}
        </option>
      ))}
    </Select>
  );
}
