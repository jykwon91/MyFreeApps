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
  /** Milliseconds. Unset means the platform's default: 30 s on a phone (too short for an upload or a model call), none on the web. */
  timeout?: number;
  /** Called as the request body goes out, for showing how much of an upload has been sent. */
  onUploadProgress?: AxiosRequestConfig["onUploadProgress"];
};
