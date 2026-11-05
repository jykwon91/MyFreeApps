import type { TOTP_STEP } from "../constants/totp-step";

export type TotpStep = (typeof TOTP_STEP)[keyof typeof TOTP_STEP];
