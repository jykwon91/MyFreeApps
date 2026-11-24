import type { SECURITY_TYPES } from "../../constants/securityTypes";

/** What a holding is. Mirrors ``backend/app/core/investment_enums.py``. */
export type SecurityType = (typeof SECURITY_TYPES)[number];
