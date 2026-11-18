import api from "@platform/core/lib/api";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

/** What axios rejects with when the phone gives up waiting, which can be after the server saved: there's no response. */
function timedOut(config: InternalAxiosRequestConfig): Error {
  return Object.assign(new Error(`timeout of ${config.timeout ?? 0}ms exceeded`), { code: "ECONNABORTED", config, isAxiosError: true });
}

/**
 * From now on, a POST to a url matching `path` reaches the fake server (so it saves) and then times out on the way back.
 * Call after starting the fake server, whose adapter it wraps.
 */
export function timeOutPostsTo(path: RegExp): void {
  const serverAdapter = api.defaults.adapter as AxiosAdapter;
  api.defaults.adapter = async (config) => {
    if (config.method !== "post" || !path.test(config.url ?? "")) return serverAdapter(config);
    await serverAdapter(config);
    throw timedOut(config);
  };
}
