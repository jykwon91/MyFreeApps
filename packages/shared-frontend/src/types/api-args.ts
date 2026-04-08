import type { AxiosRequestConfig } from "axios";

export type Args = {
  url: string;
  method?: AxiosRequestConfig["method"];
  data?: unknown;
  params?: Record<string, unknown>;
};
