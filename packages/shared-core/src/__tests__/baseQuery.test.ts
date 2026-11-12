import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import api from "../lib/api";
import { _resetPlatformForTests, configurePlatform } from "../platform/configurePlatform";
import { axiosBaseQuery } from "../store/baseQuery";

function configure(adapter: AxiosAdapter): void {
  configurePlatform({
    baseURL: "https://api.test",
    tokenStore: { get: () => null, set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
    onUnload: () => () => {},
  });
  api.defaults.adapter = adapter;
}

const defaultAdapter = api.defaults.adapter;

beforeEach(() => {
  _resetPlatformForTests();
});

afterEach(() => {
  api.defaults.adapter = defaultAdapter;
});

describe("axiosBaseQuery", () => {
  it("passes RTK Query's abort signal to the request", async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    configure(async (config) => {
      seen.push(config);
      return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
    });
    const controller = new AbortController();

    const result = await axiosBaseQuery({ url: "/things" }, { signal: controller.signal } as never, {});

    expect(result.data).toEqual({ ok: true });
    expect(seen[0].signal).toBe(controller.signal);
  });

  it("does not send a request whose signal is already aborted", async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    configure(async (config) => {
      seen.push(config);
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    });
    const controller = new AbortController();
    controller.abort();

    const result = await axiosBaseQuery({ url: "/things" }, { signal: controller.signal } as never, {});

    expect(seen).toHaveLength(0);
    expect(result.error).toEqual({ status: undefined, data: "canceled" });
  });
});
