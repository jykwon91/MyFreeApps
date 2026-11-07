import type { RESEND_STATUS } from "@/constants/resendStatus";

export type ResendStatus = (typeof RESEND_STATUS)[keyof typeof RESEND_STATUS];
