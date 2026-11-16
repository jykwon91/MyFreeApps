import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_REQUEST_TIMEOUT_MS } from "../constants/requestTimeouts";

import api from "../lib/api";
import { _resetPlatformForTests, configurePlatform } from "../platform/configurePlatform";
import { axiosBaseQuery } from "../store/baseQuery";

function configure(adapter: AxiosRequestConfig["adapter"]): void {
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

  it("hands the upload progress callback to the request", async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    configure(async (config) => {
      seen.push(config);
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    });
    const onUploadProgress = (): void => {};

    await axiosBaseQuery({ url: "/upload", method: "POST", onUploadProgress }, { signal: new AbortController().signal } as never, {});

    expect(seen[0].onUploadProgress).toBe(onUploadProgress);
  });

  it("gives a request that names no timeout the client's default", async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    configure(async (config) => {
      seen.push(config);
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    });

    await axiosBaseQuery({ url: "/things" }, { signal: new AbortController().signal } as never, {});

    expect(seen[0].timeout).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
  });

  it("lets a request's own timeout replace the default", async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    configure(async (config) => {
      seen.push(config);
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    });

    await axiosBaseQuery({ url: "/upload", method: "POST", timeout: 300_000 }, { signal: new AbortController().signal } as never, {});

    expect(seen[0].timeout).toBe(300_000);
  });

  it("reports a request the server never answers as getting no answer at all", async () => {
    // A real socket that accepts the request and never replies: the timeout is the adapter's to enforce.
    const server = createServer(() => {});
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    configure("http");
    api.defaults.baseURL = `http://127.0.0.1:${port}`;

    try {
      const result = await axiosBaseQuery({ url: "/things", timeout: 50 }, { signal: new AbortController().signal } as never, {});

      expect(result.error).toEqual({ status: undefined, data: "timeout of 50ms exceeded" });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
