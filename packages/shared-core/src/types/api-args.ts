import type { AxiosRequestConfig } from "axios";

export type Args = {
  url: string;
  method?: AxiosRequestConfig["method"];
  data?: unknown;
  params?: Record<string, unknown>;
  /** Extra per-request headers (e.g. X-Turnstile-Token). Merged over the
   * shared axios instance defaults; auth headers are still added by its
   * request interceptor. */
  headers?: Record<string, string>;
};
