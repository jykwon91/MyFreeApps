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

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
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
