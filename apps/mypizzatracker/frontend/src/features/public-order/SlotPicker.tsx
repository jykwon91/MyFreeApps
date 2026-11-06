import { Card } from "@platform/ui";
import { formatTime } from "./formatters";
import type { SlotPickerProps } from "@/types/public/SlotPickerProps";

export default function SlotPicker({ slots, selectedSlotId, onSelect }: SlotPickerProps) {
  return (
    <Card>
      <h2 className="text-lg font-semibold mb-3">Pickup time</h2>
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {slots.map((slot) => {
          const isSelected = slot.id === selectedSlotId;
          const isFull = slot.remaining_pizzas <= 0;
          return (
            <li key={slot.id}>
              <button
                type="button"
                onClick={() => !isFull && onSelect(slot.id)}
                disabled={isFull}
                className={[
                  "w-full text-left px-3 py-2 rounded border transition-colors",
                  isSelected ? "border-primary bg-primary/10" : "border-input",
                  isFull ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/50 cursor-pointer",
                ].join(" ")}
                aria-pressed={isSelected}
              >
                <div className="font-medium">{formatTime(slot.pickup_time)}</div>
                <div className="text-xs text-muted-foreground">
                  {isFull ? "Full" : `${slot.remaining_pizzas} pizza(s) left`}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
