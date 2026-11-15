import type { AxiosAdapter } from "axios";
import api from "@/shared/lib/api";
import type { ApiStubHandler } from "./types/api-stub-handler";
import { serverError } from "./server-error";

const originalAdapter = api.defaults.adapter;

/**
 * Answers every request of the real API client from `handler`, so a page under test runs its real
 * RTK Query hooks. A handler that throws or rejects answers with a 500. Undo with `restoreApi`.
 */
export function stubApi(handler: ApiStubHandler): void {
  const adapter: AxiosAdapter = async (config) => {
    const path = new URL(config.url ?? "", "http://test").pathname;
    try {
      const data: unknown = await handler(path, (config.params ?? {}) as Record<string, unknown>);
      return { status: 200, data, statusText: "OK", headers: {}, config };
    } catch {
      throw serverError(config);
    }
  };
  api.defaults.adapter = adapter;
}

export function restoreApi(): void {
  api.defaults.adapter = originalAdapter;
}
