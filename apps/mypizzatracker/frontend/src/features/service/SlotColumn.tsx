import type { DashboardSlot } from "@/types/service/service";
import { OrderCard } from "./OrderCard";

interface SlotColumnProps {
  dropId: string;
  slot: DashboardSlot;
  allSlots: DashboardSlot[];
  serverTime: string;
  readOnly: boolean;
}

export function SlotColumn({
  dropId,
  slot,
  allSlots,
  serverTime,
  readOnly,
}: SlotColumnProps) {
  return (
    <section
      className="rounded-lg border bg-background shadow-sm flex flex-col min-w-0"
      aria-labelledby={`slot-${slot.id}-header`}
    >
      <header
        id={`slot-${slot.id}-header`}
        className={
          "flex items-center justify-between gap-2 px-3 py-2 rounded-t-lg border-b " +
          capacityToneBg(slot)
        }
      >
        <div className="font-semibold tabular-nums">
          {formatPickupTime(slot.pickup_time)}
        </div>
        <div className="text-xs tabular-nums font-medium">
          {slot.pizza_count}/{slot.max_pizzas}
        </div>
      </header>

      <ol className="space-y-2 p-2 min-h-[80px]">
        {slot.orders.length === 0 ? (
          <li className="text-xs text-muted-foreground text-center py-6 italic">
            No orders yet
          </li>
        ) : (
          slot.orders.map((order) => (
            <OrderCard
              key={order.id}
              dropId={dropId}
              order={order}
              slots={allSlots}
              serverTime={serverTime}
              readOnly={readOnly}
            />
          ))
        )}
      </ol>
    </section>
  );
}

function formatPickupTime(time: string): string {
  return time.length >= 5 ? time.slice(0, 5) : time;
}

/**
 * Header background hint by remaining capacity.
 *
 *   remaining = 0           -> red (full)
 *   1 <= remaining <= 30%   -> amber (filling up)
 *   otherwise               -> green (plenty of room)
 *
 * Subtle backgrounds so the operator can scan column health without
 * focusing on individual cards.
 */
function capacityToneBg(slot: DashboardSlot): string {
  if (slot.remaining_capacity === 0) {
    return "bg-red-100 dark:bg-red-950/40 text-red-900 dark:text-red-200";
  }
  const remainingFraction = slot.remaining_capacity / Math.max(slot.max_pizzas, 1);
  if (remainingFraction <= 0.3) {
    return "bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200";
  }
  return "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200";
}
