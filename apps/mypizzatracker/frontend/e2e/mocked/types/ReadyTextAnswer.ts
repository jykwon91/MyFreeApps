import type { AdvanceOrderResponse } from "@/types/service/service";

/** How the stubbed backend reports the order-ready text on an advance to ready_text_sent. */
export type ReadyTextAnswer = Pick<AdvanceOrderResponse, "sms_dispatched" | "sms_error" | "sms_outcome_unknown">;
