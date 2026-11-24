import type { CASH_FLOW_SCOPES } from "../../constants/budget";

export type CashFlowScope = (typeof CASH_FLOW_SCOPES)[number]["key"];
