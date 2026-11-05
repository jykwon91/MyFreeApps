import api from "@platform/core/lib/api";
import type { TotpSetup } from "@platform/core/types/security/totp-setup";
import type { TotpVerifyResponse } from "@platform/core/types/security/totp-verify-response";
import { isAxiosError } from "axios";
import { TWO_STEP_TIMEOUT_MS } from "../constants/session";
import { TWO_STEP_DETAILS } from "../constants/twoStep";
import type { TwoStepDisableResult } from "../types/TwoStepDisableResult";
import type { TwoStepSetupResult } from "../types/TwoStepSetupResult";
import type { TwoStepVerifyResult } from "../types/TwoStepVerifyResult";

function detailOf(data: unknown): unknown {
  return (data as { detail?: unknown } | undefined)?.detail;
}

export async function requestTwoStepSetup(password: string): Promise<TwoStepSetupResult> {
  try {
    const { data } = await api.post<TotpSetup>("/auth/totp/setup", { password }, { timeout: TWO_STEP_TIMEOUT_MS });
    return { outcome: "started", setup: data };
  } catch (error) {
    if (!isAxiosError(error) || !error.response) return { outcome: "failed" };
    const { status, data } = error.response;
    if (status === 429) return { outcome: "rate_limited" };
    if (detailOf(data) === TWO_STEP_DETAILS.wrongPassword) return { outcome: "wrong_password" };
    if (detailOf(data) === TWO_STEP_DETAILS.alreadyOn) return { outcome: "already_on" };
    return { outcome: "failed" };
  }
}

export async function requestTwoStepVerify(code: string): Promise<TwoStepVerifyResult> {
  try {
    const { data } = await api.post<TotpVerifyResponse>("/auth/totp/verify", { code }, { timeout: TWO_STEP_TIMEOUT_MS });
    return { outcome: "turned_on", recoveryCodes: data.recovery_codes };
  } catch (error) {
    // No answer, or a server failing part-way: it may have turned on.
    if (!isAxiosError(error) || !error.response || error.response.status >= 500) return { outcome: "unknown" };
    const { status, data } = error.response;
    if (status === 429) return { outcome: "rate_limited" };
    if (detailOf(data) === TWO_STEP_DETAILS.alreadyOn) return { outcome: "already_on" };
    if (detailOf(data) === TWO_STEP_DETAILS.notStarted) return { outcome: "not_started" };
    if (status === 400) return { outcome: "wrong_code" };
    return { outcome: "unknown" };
  }
}

export async function requestTwoStepDisable(code: string): Promise<TwoStepDisableResult> {
  try {
    await api.post("/auth/totp/disable", { code }, { timeout: TWO_STEP_TIMEOUT_MS });
    return "turned_off";
  } catch (error) {
    if (!isAxiosError(error) || !error.response || error.response.status >= 500) return "unknown";
    const { status, data } = error.response;
    if (status === 429) return "rate_limited";
    if (detailOf(data) === TWO_STEP_DETAILS.alreadyOff) return "already_off";
    if (status === 400) return "wrong_code";
    return "unknown";
  }
}
