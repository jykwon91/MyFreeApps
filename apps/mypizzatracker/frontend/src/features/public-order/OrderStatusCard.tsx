/**
 * Order confirmation / status display.
 *
 * Used in two places:
 *   1. PublicOrder.tsx — after a customer submits a new order, the
 *      placement response is rendered here in "confirmation" mode
 *      (heading: "Order placed!").
 *   2. PublicOrderStatus.tsx — when the customer revisits /order/status/:id,
 *      the fetched order is rendered here in "status" mode
 *      (heading: "Order status").
 *
 * Both modes show the same fields; only the heading + sub-copy differ.
 */
import { Card, StatusBadge } from "@platform/ui";
import { CheckCircle2, Phone } from "lucide-react";
import type {
  PublicOrderConfirmation,
} from "@/types/public/public";
import {
  PUBLIC_ORDER_STATUS_LABELS,
  PUBLIC_PAYMENT_STATUS_LABELS,
} from "@/types/public/public";
import {
  formatDateLong,
  formatMoney,
  formatPhoneDisplay,
  formatTime,
  paymentMethodLabel,
  shortId,
} from "./formatters";

export interface OrderStatusCardProps {
  order: PublicOrderConfirmation;
  /**
   * "fresh" -> just placed (confirmation tone, green check).
   * "lookup" -> later status check (neutral tone, status-focused heading).
   */
  variant: "fresh" | "lookup";
}

export function OrderStatusCard({ order, variant }: OrderStatusCardProps) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          {variant === "fresh" ? (
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
          ) : null}
          <div>
            <h2 className="text-xl font-semibold">
              {variant === "fresh" ? "Order placed!" : "Order status"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Pickup at {formatTime(order.slot_pickup_time)} on {formatDateLong(order.drop_date)}
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Order #</span>
            <span className="font-mono">{shortId(order.order_id)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span>{order.customer_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              <Phone className="inline h-3 w-3 mr-1" />
              Phone
            </span>
            <span>{formatPhoneDisplay(order.customer_phone)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <StatusBadge
              tone={statusTone(order.status)}
              label={PUBLIC_ORDER_STATUS_LABELS[order.status]}
            />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Payment</span>
            <span>
              {paymentMethodLabel(order.payment_method_tag)} (
              {PUBLIC_PAYMENT_STATUS_LABELS[order.payment_status]})
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-semibold mb-3">Your order</h3>
        <ul className="divide-y">
          {order.pizzas.map((p, i) => (
            <li key={i} className="py-2">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <div className="font-medium">{p.pizza_name}</div>
                  {p.toppings.length > 0 ? (
                    <div className="text-xs text-muted-foreground">
                      + {p.toppings.join(", ")}
                    </div>
                  ) : null}
                  {p.modifications_text ? (
                    <div className="text-xs italic text-muted-foreground">
                      "{p.modifications_text}"
                    </div>
                  ) : null}
                </div>
                <div className="text-sm shrink-0">
                  ${formatMoney(p.line_total)}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 pt-3 border-t flex justify-between text-base font-semibold">
          <span>Total</span>
          <span>${formatMoney(order.total)}</span>
        </div>
      </Card>
    </div>
  );
}

/**
 * Map the order's status enum to a StatusBadge tone. ``ready_*`` is positive,
 * ``picked_up`` is success-ish, ``no_show`` is warning, in-progress is info.
 */
function statusTone(
  status: PublicOrderConfirmation["status"],
): "info" | "success" | "warning" {
  switch (status) {
    case "ready_text_sent":
    case "ready_waiting":
    case "picked_up":
      return "success";
    case "no_show":
      return "warning";
    case "not_started":
    case "cooking":
    default:
      return "info";
  }
}
