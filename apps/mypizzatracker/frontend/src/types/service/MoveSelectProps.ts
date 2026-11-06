import type { DashboardSlot } from "@/types/service/service";

export interface MoveSelectProps {
  currentSlotId: string;
  slots: DashboardSlot[];
  disabled: boolean;
  onMove: (slotId: string) => void;
}
