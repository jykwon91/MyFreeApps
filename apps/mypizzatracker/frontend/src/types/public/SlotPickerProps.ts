import type { PublicSlot } from "./public";

export interface SlotPickerProps {
  slots: PublicSlot[];
  selectedSlotId: string;
  onSelect: (id: string) => void;
}
