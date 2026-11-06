import { Card } from "@platform/ui";
import { formatDateLong, formatTime } from "./formatters";
import type { DropHeaderProps } from "@/types/public/DropHeaderProps";

export default function DropHeader({ drop }: DropHeaderProps) {
  return (
    <Card>
      <h2 className="text-lg font-semibold">{drop.name}</h2>
      <p className="text-sm text-muted-foreground">
        {formatDateLong(drop.date)} -- pickup window {formatTime(drop.slot_window_start)} to {formatTime(drop.slot_window_end)}
      </p>
    </Card>
  );
}
