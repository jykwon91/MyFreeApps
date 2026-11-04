import type { BadgeTone } from "@platform/ui";
import type { RentChargeStatus } from "@mybookkeeper/api-client/types/rent/rent-charge-status";

/** Status → badge tone.
 *
 * `partial` is deliberately `info`, not `warning`: a tenant paying weekly
 * against a monthly charge sits at `partial` for most of every month, and
 * colouring the normal case as a problem would make the panel cry wolf. Only
 * `overdue` — the period ended short — earns alarm.
 */
export const RENT_CHARGE_STATUS_TONE: Record<RentChargeStatus, BadgeTone> = {
  paid: "success",
  partial: "info",
  open: "neutral",
  overdue: "danger",
  waived: "neutral",
};
