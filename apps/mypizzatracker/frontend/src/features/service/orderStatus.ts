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
 * Ordered list of "happy path" advance choices for a given current state.
 *
 * The first element is the recommended primary action; any additional
 * elements are secondary (rendered as ghost buttons). Terminal states
 * return an empty list. `no_show` is offered separately as a sad-path
 * action on every non-terminal card and is not part of this list.
 *
 * Cooking forks into two choices since PR 8 wired Twilio:
 *   - `ready_text_sent` (primary) -- transition AND send the customer
 *     a ready-pickup SMS via Twilio.
 *   - `ready_waiting` (secondary) -- transition only; operator will
 *     text manually or skip the text.
 */
export function advanceChoices(current: OrderStatus): OrderStatus[] {
  switch (current) {
    case "not_started":
      return ["cooking"];
    case "cooking":
      return ["ready_text_sent", "ready_waiting"];
    case "ready_text_sent":
      return ["picked_up"];
    case "ready_waiting":
      return ["picked_up"];
    case "picked_up":
    case "no_show":
      return [];
  }
}

export function isTerminal(status: OrderStatus): boolean {
  return status === "picked_up" || status === "no_show";
}
