import type { BadgeTone } from "@platform/ui";
import type { OrderStatus } from "@/types/service/service";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  not_started: "Not started",
  cooking: "Cooking",
  ready_text_sent: "Ready - text sent",
  ready_waiting: "Ready - waiting",
  picked_up: "Picked up",
  no_show: "No show",
};

export const ORDER_STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  not_started: "neutral",
  cooking: "warning",
  ready_text_sent: "info",
  ready_waiting: "info",
  picked_up: "success",
  no_show: "danger",
};

/**
 * The single "happy path" next status surfaced in PR 7's advance button.
 *
 * `ready_text_sent` is hidden from the advance UI in PR 7 (Twilio comes
 * in PR 8). From `cooking`, the operator skips straight to
 * `ready_waiting`. From `ready_text_sent` (only reachable post-PR-8 or
 * via direct API), the operator advances to `picked_up`.
 *
 * Terminal states have no next; `no_show` is offered separately as a
 * sad-path secondary action on every non-terminal card.
 */
export function nextAdvanceStatus(current: OrderStatus): OrderStatus | null {
  switch (current) {
    case "not_started":
      return "cooking";
    case "cooking":
      return "ready_waiting";
    case "ready_text_sent":
      return "picked_up";
    case "ready_waiting":
      return "picked_up";
    case "picked_up":
    case "no_show":
      return null;
  }
}

export function isTerminal(status: OrderStatus): boolean {
  return status === "picked_up" || status === "no_show";
}
