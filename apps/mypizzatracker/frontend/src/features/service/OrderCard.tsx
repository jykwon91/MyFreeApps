import { useState } from "react";
import {
  Button,
  LoadingButton,
  StatusBadge,
  ConfirmDialog,
  Select,
  showError,
  showSuccess,
  extractErrorMessage,
} from "@platform/ui";
import { Clock } from "lucide-react";
import {
  useAdvanceOrderMutation,
  useMoveOrderMutation,
} from "@/store/serviceApi";
import type {
  DashboardOrder,
  DashboardSlot,
} from "@/types/service/service";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  isTerminal,
  nextAdvanceStatus,
} from "./orderStatus";

interface OrderCardProps {
  dropId: string;
  order: DashboardOrder;
  slots: DashboardSlot[];
  serverTime: string;
  /** Drop status -- when "closed", all mutations are disabled at the UI layer. */
  readOnly: boolean;
}

const STALE_MINUTES = 20;
const STALE_STATUSES = new Set(["not_started", "cooking"]);

export function OrderCard({
  dropId,
  order,
  slots,
  serverTime,
  readOnly,
}: OrderCardProps) {
  const [advance, { isLoading: isAdvancing }] = useAdvanceOrderMutation();
  const [move, { isLoading: isMoving }] = useMoveOrderMutation();
  const [confirmNoShow, setConfirmNoShow] = useState(false);

  const mutating = isAdvancing || isMoving;
  const terminal = isTerminal(order.status);
  const next = nextAdvanceStatus(order.status);

  const stale = computeStale(order.updated_at, serverTime, order.status);

  const onAdvance = async () => {
    if (!next) return;
    try {
      await advance({
        dropId,
        orderId: order.id,
        targetStatus: next,
      }).unwrap();
      showSuccess(`Moved to ${ORDER_STATUS_LABELS[next]}`);
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to advance order");
    }
  };

  const onNoShow = async () => {
    try {
      await advance({
        dropId,
        orderId: order.id,
        targetStatus: "no_show",
      }).unwrap();
      showSuccess("Marked no-show");
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to mark no-show");
    }
  };

  const onMove = async (newSlotId: string) => {
    if (newSlotId === order.slot_id) return;
    try {
      await move({
        dropId,
        orderId: order.id,
        slotId: newSlotId,
      }).unwrap();
      const target = slots.find((s) => s.id === newSlotId);
      showSuccess(`Moved to ${formatPickupTime(target?.pickup_time)}`);
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to move order");
    }
  };

  return (
    <li
      className={
        "rounded border bg-card p-3 space-y-2 " +
        (terminal ? "opacity-60" : "")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">
            {order.customer.name}
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {order.customer.phone}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-semibold tabular-nums">
            ${formatMoney(order.total)}
          </div>
          <div className="text-xs text-muted-foreground">
            {order.payment_method_tag}
          </div>
        </div>
      </div>

      <ul className="text-xs space-y-0.5">
        {order.pizzas.map((p) => (
          <li key={p.id}>
            <span className="font-medium">{p.name}</span>
            {p.is_free ? (
              <span className="ml-1 text-emerald-600">(free)</span>
            ) : null}
            {p.toppings.length > 0 ? (
              <span className="text-muted-foreground">
                {" "}+ {p.toppings.map((t) => t.name).join(", ")}
              </span>
            ) : null}
            {p.modifications_text ? (
              <span className="text-muted-foreground italic">
                {" "}-- {p.modifications_text}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2 pt-1 border-t">
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge
            tone={ORDER_STATUS_TONES[order.status]}
            label={ORDER_STATUS_LABELS[order.status]}
          />
          {stale ? (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600">
              <Clock className="h-3 w-3" />
              {stale}
            </span>
          ) : null}
        </div>
      </div>

      {!readOnly && !terminal ? (
        <div className="flex items-center gap-2 flex-wrap">
          {next ? (
            <LoadingButton
              size="sm"
              isLoading={isAdvancing}
              loadingText="Saving..."
              onClick={onAdvance}
              disabled={mutating}
            >
              -&gt; {ORDER_STATUS_LABELS[next]}
            </LoadingButton>
          ) : null}
          <MoveSelect
            currentSlotId={order.slot_id}
            slots={slots}
            disabled={mutating}
            onMove={onMove}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmNoShow(true)}
            disabled={mutating}
          >
            No-show
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmNoShow}
        onCancel={() => setConfirmNoShow(false)}
        onConfirm={onNoShow}
        title={`Mark ${order.customer.name}'s order as no-show?`}
        description="The customer did not pick up. The slot's capacity will free up for new orders."
        confirmLabel="Mark no-show"
        variant="destructive"
        isLoading={isAdvancing}
      />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Move dropdown
// ---------------------------------------------------------------------------

interface MoveSelectProps {
  currentSlotId: string;
  slots: DashboardSlot[];
  disabled: boolean;
  onMove: (slotId: string) => void;
}

function MoveSelect({
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(value: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toFixed(2);
}

function formatPickupTime(time: string | undefined): string {
  if (!time) return "?";
  return time.length >= 5 ? time.slice(0, 5) : time;
}

/**
 * Returns a label like ``12 min`` for stale not_started/cooking orders.
 * Stale means updated_at + STALE_MINUTES < server_time. Uses server-supplied
 * timestamps so client clock skew doesn't affect the calculation.
 */
function computeStale(
  updatedAt: string,
  serverTime: string,
  status: string,
): string | null {
  if (!STALE_STATUSES.has(status)) return null;
  const updated = Date.parse(updatedAt);
  const now = Date.parse(serverTime);
  if (!Number.isFinite(updated) || !Number.isFinite(now)) return null;
  const minutes = Math.floor((now - updated) / 60000);
  if (minutes < STALE_MINUTES) return null;
  return `${minutes} min`;
}
