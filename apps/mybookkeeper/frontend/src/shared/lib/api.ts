import axios from "axios";
import { notifyAuthChange } from "./auth-store";

const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const orgId = localStorage.getItem("v1_activeOrgId");
  if (orgId) {
    config.headers["X-Organization-Id"] = orgId;
  }

  return config;
});

// Endpoints that may return 401 for reasons OTHER than JWT expiry (e.g. a
// third-party integration refresh token that has been revoked). A 401 from
// these routes must NOT force a logout — it should surface as a normal error
// so the user can self-serve (e.g. disconnect and reconnect Gmail).
const BUSINESS_401_URL_PREFIXES: readonly string[] = ["/integrations/gmail/sync"];

function isBusinessLevel401(url: string | undefined): boolean {
  if (!url) return false;
  return BUSINESS_401_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !isBusinessLevel401(err.config?.url)) {
      const isLoginRequest = err.config?.url?.includes("/auth/");
      const isAlreadyOnLogin = window.location.pathname === "/login";
      if (!isLoginRequest && !isAlreadyOnLogin) {
        localStorage.removeItem("token");
        notifyAuthChange();
      }
    }
    if (err.response?.status === 403) {
      err.message = err.response?.data?.detail ?? "You don't have permission to do that.";
    }
    return Promise.reject(err);
  }
);

export default api;
