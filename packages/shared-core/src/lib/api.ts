import axios from "axios";
import type { AxiosResponse } from "axios";
import { installStepUpInterceptor } from "../auth/stepUpInterceptor";
import { getPlatform, onPlatformConfigured } from "../platform/configurePlatform";
import { NO_REFRESH_URL_PARTS } from "../constants/sessionRefresh";
import { notifyAuthChange } from "./auth-store";
import { isRefreshCoolingDown, refreshSessionOnce } from "./session-refresh";
import { isExemptFromSignOut } from "./signOutExemptions";
import type { SessionRetryConfig } from "./types/SessionRetryConfig";

const api = axios.create();

async function retryWithNewSession(config: SessionRetryConfig): Promise<AxiosResponse | null> {
  const token = getPlatform().tokenStore.get();
  // A request sent before the last refresh only needs the token that refresh got.
  if (token === null || config._sentToken === token) {
    if (isRefreshCoolingDown()) return null;
    if ((await refreshSessionOnce()) !== "refreshed") return null;
  }
  const { currentAccount } = getPlatform();
  if (currentAccount && currentAccount() !== config._sentAccount) return null;
  config._sessionRetried = true;
  return api.request(config);
}

onPlatformConfigured(({ baseURL }) => {
  api.defaults.baseURL = baseURL;
});

// The stores must not throw: a read that throws would fail every request
// instead of sending it unauthenticated.
// A request that names its own Authorization keeps it. One this client attached is
// replaced when the request is sent again, since the token may have changed.
api.interceptors.request.use((config: SessionRetryConfig) => {
  const { tokenStore, orgStore, currentAccount } = getPlatform();

  if (!config._sessionRetried) config._sentAccount = currentAccount?.();

  if (!config.headers.Authorization || config._sentToken !== undefined) {
    const token = tokenStore.get();
    config._sentToken = token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      config.headers.delete("Authorization");
    }
  }

  const orgId = orgStore.get();
  if (orgId) {
    config.headers["X-Organization-Id"] = orgId;
  }

  return config;
});

function _hasStepUpHeader(headers: unknown): boolean {
  if (!headers || typeof headers !== "object") return false;
  const value =
    (headers as Record<string, unknown>)["x-require-step-up"] ??
    (headers as Record<string, unknown>)["X-Require-Step-Up"];
  return value === "totp" || value === "reauth";
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 && !isExemptFromSignOut(err.config?.url)) {
      // Step-up 401s (X-Require-Step-Up: totp | reauth) are owned by
      // the step-up interceptor — do NOT clear the token here. Without
      // this exclusion the existing logout-on-401 path would clobber
      // the JWT before the step-up retry could fire.
      if (_hasStepUpHeader(err.response?.headers)) {
        return Promise.reject(err);
      }
      const { isOnLogin, tokenStore, refreshSession } = getPlatform();
      const config: SessionRetryConfig | undefined = err.config;
      if (refreshSession) {
        const url: string = err.config?.url ?? "";
        if (
          !config ||
          config._sessionRetried ||
          config._sentToken === undefined ||
          NO_REFRESH_URL_PARTS.some((part) => url.includes(part))
        ) {
          return Promise.reject(err);
        }
        const retried = await retryWithNewSession(config);
        return retried ?? Promise.reject(err);
      }
      const isLoginRequest = err.config?.url?.includes("/auth/");
      // Only a rejection of the token signed in now signs out. One sent with a token
      // since replaced, by a sign-in here or in another tab, says nothing about it.
      const rejectedCurrentToken = config?._sentToken === tokenStore.get();
      if (!isLoginRequest && !isOnLogin() && rejectedCurrentToken) {
        tokenStore.clear();
        notifyAuthChange();
      }
    }
    if (err.response?.status === 403) {
      err.message = err.response?.data?.detail ?? "You don't have permission to do that.";
    }
    return Promise.reject(err);
  }
);

installStepUpInterceptor(api);

export default api;
