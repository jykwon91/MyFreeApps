import posthog from "posthog-js";
import api from "./api";
import { notifyAuthChange } from "./auth-store";
import { store } from "@/shared/store";
import { baseApi } from "@/shared/store/baseApi";
import { clearOrganizationState } from "@/shared/store/organizationSlice";

export { useIsAuthenticated, notifyAuthChange } from "./auth-store";

interface LoginResponse {
  access_token?: string;
  token_type?: string;
  detail?: string;
}

function isPosthogReady(): boolean {
  return Boolean((posthog as unknown as { __loaded?: boolean }).__loaded);
}

function identifyInPosthog(token: string, email: string): void {
  if (!isPosthogReady()) return;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const userId = payload.sub;
    if (userId) {
      posthog.identify(userId, { email });
    }
  } catch {
    // best-effort — analytics identification must never block auth
  }
}

function resetSessionState(): void {
  // Clear cached API responses + in-memory org selection so the next
  // session starts from a clean slate. Without this, RTK Query serves
  // the previous user's data until a hard reload, which manifests as
  // "I need to open a new tab to log in."
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(clearOrganizationState());
}

export async function login(
  email: string,
  password: string,
  totpCode?: string,
): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/auth/totp/login", {
    email,
    password,
    totp_code: totpCode || null,
  });

  if (data.access_token) {
    localStorage.setItem("token", data.access_token);
    resetSessionState();
    identifyInPosthog(data.access_token, email);
    notifyAuthChange();
  }

  return data;
}

export function logout(): void {
  localStorage.removeItem("token");
  localStorage.removeItem("v1_activeOrgId");
  resetSessionState();
  if (isPosthogReady()) {
    posthog.reset();
  }
  notifyAuthChange();
  window.location.href = "/login";
}

export function isAuthenticated(): boolean {
  const token = localStorage.getItem("token");
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
