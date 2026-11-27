import { requestVerifyToken } from "@platform/core/auth/requestVerifyToken";
import { turnstileHeaders } from "@platform/core/auth/turnstileHeaders";
import { DELETE_ACCOUNT_TIMEOUT_MS } from "@platform/core/constants/requestTimeouts";
import api from "@platform/core/lib/api";
import { isAxiosError } from "axios";
import { AUTH_REQUEST_TIMEOUT_MS, LOGOUT_TIMEOUT_MS, TWO_STEP_TIMEOUT_MS } from "../constants/session";
import type { AuthFormFailure } from "../types/AuthFormFailure";
import type { DeleteAccountDetails } from "../types/DeleteAccountDetails";
import type { DeleteAccountResult } from "../types/DeleteAccountResult";
import type { MobileTokens } from "../types/MobileTokens";
import type { PasswordResetRequestResult } from "../types/PasswordResetRequestResult";
import type { RegisterDetails } from "../types/RegisterDetails";
import type { RegisterResult } from "../types/RegisterResult";
import type { ResendVerificationOutcome } from "../types/ResendVerificationOutcome";
import type { SignInCredentials } from "../types/SignInCredentials";
import type { SignInFailure } from "../types/SignInFailure";

const REFRESH_INVALID_DETAIL = "refresh_invalid";
const TOTP_REQUIRED_DETAIL = "totp_required";
// The backend's Turnstile gate (make_require_turnstile in platform_shared).
const CAPTCHA_REJECTED_DETAILS: ReadonlySet<unknown> = new Set(["Captcha token required", "captcha_verification_failed"]);
const CAPTCHA_EXPIRED_DETAIL = "captcha_expired_please_retry";
const CAPTCHA_UNAVAILABLE_DETAILS: ReadonlySet<unknown> = new Set(["captcha_service_misconfigured", "captcha_service_unavailable"]);
// fastapi-users' register refusals.
const EMAIL_TAKEN_DETAIL = "REGISTER_USER_ALREADY_EXISTS";
const INVALID_PASSWORD_CODE = "REGISTER_INVALID_PASSWORD";

type LoginResponse = MobileTokens | { detail: string };

function classifyLoginError(error: unknown): SignInFailure {
  if (!isAxiosError(error) || !error.response) return "unreachable";
  const { status, data } = error.response;
  const detail: unknown = (data as { detail?: unknown } | undefined)?.detail;
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unreachable";
  if (detail === "LOGIN_BAD_CREDENTIALS") return "bad_credentials";
  if (detail === "LOGIN_USER_NOT_VERIFIED") return "not_verified";
  if (detail === "invalid_totp") return "invalid_totp";
  return "unexpected";
}

export async function requestLogin(
  { email, password, totpCode }: SignInCredentials,
  deviceName: string | null,
): Promise<MobileTokens | "totp_required" | SignInFailure> {
  try {
    const { data } = await api.post<LoginResponse>(
      "/auth/mobile/login",
      { email, password, totp_code: totpCode, device_name: deviceName },
      { timeout: AUTH_REQUEST_TIMEOUT_MS },
    );
    if ("access_token" in data) return data;
    return data.detail === TOTP_REQUIRED_DETAIL ? "totp_required" : "unexpected";
  } catch (error) {
    return classifyLoginError(error);
  }
}

function errorDetail(error: unknown): unknown {
  return isAxiosError(error) ? (error.response?.data as { detail?: unknown } | undefined)?.detail : undefined;
}

/** A FastAPI 422 that names the email field, such as an address with no "@". */
function isEmailRejected(detail: unknown): boolean {
  return (
    Array.isArray(detail) &&
    detail.some((item) => {
      const loc = (item as { loc?: unknown } | null)?.loc;
      return Array.isArray(loc) && loc.includes("email");
    })
  );
}

/** Why a captcha-checked form failed. The captcha refusals come first: the backend checks it before anything else. */
function classifyAuthFormError(error: unknown): AuthFormFailure {
  if (!isAxiosError(error) || !error.response) return "unreachable";
  const { status } = error.response;
  const detail = errorDetail(error);
  if (CAPTCHA_UNAVAILABLE_DETAILS.has(detail)) return "captcha_unavailable";
  if (detail === CAPTCHA_EXPIRED_DETAIL) return "captcha_expired";
  if (CAPTCHA_REJECTED_DETAILS.has(detail)) return "captcha_rejected";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unreachable";
  if (status === 422 && isEmailRejected(detail)) return "invalid_email";
  return "unexpected";
}

/** fastapi-users' `{ code: "REGISTER_INVALID_PASSWORD", reason }`, or null for any other refusal. */
function invalidPasswordReason(detail: unknown): string | null {
  if (typeof detail !== "object" || detail === null) return null;
  const { code, reason } = detail as { code?: unknown; reason?: unknown };
  return code === INVALID_PASSWORD_CODE && typeof reason === "string" && reason.trim() !== "" ? reason.trim() : null;
}

/**
 * Creates an account. The backend then emails a verification link, and the person signs in once they've used it,
 * so this doesn't sign them in. A blank name is left out, so the backend keeps its own default.
 */
export async function requestRegister(
  { email, password, name, nameField }: RegisterDetails,
  turnstileToken: string,
): Promise<RegisterResult> {
  const trimmedName = name.trim();
  try {
    await api.post(
      "/auth/register",
      { email, password, ...(trimmedName ? { [nameField]: trimmedName } : {}) },
      { headers: turnstileHeaders(turnstileToken), timeout: AUTH_REQUEST_TIMEOUT_MS },
    );
    return { outcome: "registered" };
  } catch (error) {
    const detail = errorDetail(error);
    if (detail === EMAIL_TAKEN_DETAIL) return { outcome: "failed", failure: "email_taken" };
    const reason = invalidPasswordReason(detail);
    if (reason) return { outcome: "weakPassword", reason };
    return { outcome: "failed", failure: classifyAuthFormError(error) };
  }
}

/**
 * Asks for a password-reset email. The backend answers 202 for every address, so `sent` never says whether one is
 * registered. The link in the email opens the website, which sets the new password.
 */
export async function requestPasswordReset(email: string, turnstileToken: string): Promise<PasswordResetRequestResult> {
  try {
    await api.post(
      "/auth/forgot-password",
      { email },
      { headers: turnstileHeaders(turnstileToken), timeout: AUTH_REQUEST_TIMEOUT_MS },
    );
    return { outcome: "sent" };
  } catch (error) {
    return { outcome: "failed", failure: classifyAuthFormError(error) };
  }
}

export async function resendVerificationEmail(email: string): Promise<ResendVerificationOutcome> {
  try {
    await requestVerifyToken(email, AUTH_REQUEST_TIMEOUT_MS);
    return "sent";
  } catch (error) {
    return isAxiosError(error) && error.response?.status === 429 ? "rate_limited" : "failed";
  }
}

/** Only `refused` ends the session: a rate limit or an outage says nothing about it. */
export async function requestRefresh(refreshToken: string): Promise<MobileTokens | "refused" | "no_answer"> {
  try {
    const { data } = await api.post<MobileTokens>(
      "/auth/mobile/refresh",
      { refresh_token: refreshToken },
      { timeout: AUTH_REQUEST_TIMEOUT_MS },
    );
    return data;
  } catch (error) {
    if (
      isAxiosError(error) &&
      error.response?.status === 401 &&
      (error.response.data as { detail?: unknown } | undefined)?.detail === REFRESH_INVALID_DETAIL
    ) {
      return "refused";
    }
    return "no_answer";
  }
}

export async function requestLogout(refreshToken: string): Promise<boolean> {
  try {
    await api.post("/auth/mobile/logout", { refresh_token: refreshToken }, { timeout: LOGOUT_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

export async function fetchTwoFactorEnabled(): Promise<boolean> {
  const { data } = await api.get<{ enabled: boolean }>("/auth/totp/status", { timeout: TWO_STEP_TIMEOUT_MS });
  // A proxy or web fallback can answer 200 with something else, and that must not read as "off".
  if (typeof data?.enabled !== "boolean") throw new Error("Unexpected two-step status answer");
  return data.enabled;
}

function classifyDeleteError(error: unknown): DeleteAccountResult {
  // No answer, or a server failing part-way: the delete may have gone through.
  if (!isAxiosError(error) || !error.response || error.response.status >= 500) return { outcome: "unknown" };
  const { status, data } = error.response;
  const detail: unknown = (data as { detail?: unknown } | undefined)?.detail;
  if (status === 401) return { outcome: "unknown" };
  if (status === 429) return { outcome: "rate_limited" };
  if (status === 409 && typeof detail === "string") return { outcome: "refused", message: detail };
  if (detail === "Incorrect password") return { outcome: "wrong_password" };
  if (detail === "Email confirmation does not match") return { outcome: "email_mismatch" };
  if (detail === "TOTP_CODE_REQUIRED") return { outcome: "code_required" };
  if (detail === "Invalid TOTP code") return { outcome: "invalid_code" };
  return { outcome: "failed" };
}

export async function requestDeleteAccount({ email, password, code }: DeleteAccountDetails): Promise<DeleteAccountResult> {
  try {
    await api.delete("/users/me", {
      data: { password, confirm_email: email, totp_code: code },
      timeout: DELETE_ACCOUNT_TIMEOUT_MS,
    });
    return { outcome: "deleted" };
  } catch (error) {
    return classifyDeleteError(error);
  }
}
