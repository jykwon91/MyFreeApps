import axios from "axios";
import { installStepUpInterceptor } from "../auth/stepUpInterceptor";
import { getPlatform, onPlatformConfigured } from "../platform/configurePlatform";
import { notifyAuthChange } from "./auth-store";

const api = axios.create();

onPlatformConfigured(({ baseURL }) => {
  api.defaults.baseURL = baseURL;
});

// The stores must not throw: a read that throws would fail every request
// instead of sending it unauthenticated.
// A request that names its own Authorization (another scheme) keeps it.
api.interceptors.request.use((config) => {
  const { tokenStore, orgStore } = getPlatform();

  const token = tokenStore.get();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
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
  (err) => {
    if (err.response?.status === 401) {
      // Step-up 401s (X-Require-Step-Up: totp | reauth) are owned by
      // the step-up interceptor — do NOT clear the token here. Without
      // this exclusion the existing logout-on-401 path would clobber
      // the JWT before the step-up retry could fire.
      if (_hasStepUpHeader(err.response?.headers)) {
        return Promise.reject(err);
      }
      const isLoginRequest = err.config?.url?.includes("/auth/");
      const { isOnLogin, tokenStore } = getPlatform();
      if (!isLoginRequest && !isOnLogin()) {
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
