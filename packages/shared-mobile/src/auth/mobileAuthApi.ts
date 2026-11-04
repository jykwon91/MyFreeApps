import api from "@platform/core/lib/api";
import { isAxiosError } from "axios";
import { AUTH_REQUEST_TIMEOUT_MS, LOGOUT_TIMEOUT_MS } from "../constants/session";
import type { MobileTokens } from "../types/MobileTokens";
import type { SignedInDevice } from "../types/SignedInDevice";
import type { SignInCredentials } from "../types/SignInCredentials";
import type { SignInFailure } from "../types/SignInFailure";

const REFRESH_INVALID_DETAIL = "refresh_invalid";
const TOTP_REQUIRED_DETAIL = "totp_required";

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

export async function fetchDevices(): Promise<SignedInDevice[]> {
  const { data } = await api.get<SignedInDevice[]>("/auth/mobile/sessions");
  return data;
}

export async function revokeDevice(id: string): Promise<void> {
  await api.delete(`/auth/mobile/sessions/${encodeURIComponent(id)}`);
}
