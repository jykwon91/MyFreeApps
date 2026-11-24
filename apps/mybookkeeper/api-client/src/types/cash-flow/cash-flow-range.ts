import type { CASH_FLOW_RANGES } from "../../constants/budget";

export type CashFlowRange = (typeof CASH_FLOW_RANGES)[number]["key"];
