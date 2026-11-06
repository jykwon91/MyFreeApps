import { Card, StatusBadge } from "@platform/ui";
import { Calendar, Clock, Pizza } from "lucide-react";
import DropActions from "./DropActions";
import SlotEditor from "./SlotEditor";
import { STATUS_TONE } from "./dropStatusTone";
import { formatTime } from "./dropTime";
import { DROP_STATUS_LABELS } from "@/types/drop/drop";
import type { DropCardProps } from "@/types/drop/DropCardProps";

export default function DropCard({ drop }: DropCardProps) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{drop.name}</h2>
            <StatusBadge
              tone={STATUS_TONE[drop.status]}
              label={DROP_STATUS_LABELS[drop.status]}
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {drop.date}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatTime(drop.slot_window_start)}{" "}-{" "}
              {formatTime(drop.slot_window_end)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Pizza className="h-3.5 w-3.5" />
              {drop.slots.length} slot{drop.slots.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <DropActions drop={drop} />
      </div>
      <div className="mt-4">
        <SlotEditor drop={drop} />
      </div>
    </Card>
  );
}
