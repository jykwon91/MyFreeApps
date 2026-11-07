import { afterEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@/shared/store/baseApi";
// Side-effect import: registers getGenerateDefaults on the shared baseApi.
import "@/shared/store/leaseTemplatesApi";

vi.mock("@platform/core/lib/api", () => ({
  default: vi.fn(async () => ({ data: { defaults: [] } })),
}));

const apiModule = await import("@/shared/lib/api");
const mockedApi = apiModule.default as unknown as ReturnType<typeof vi.fn>;

type EndpointsMap = Record<string, { initiate: (arg?: unknown) => unknown }>;

afterEach(() => {
  vi.useRealTimers();
});

describe("getGenerateDefaults", () => {
  it("sends the host's local date for today defaults", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 11:30pm local: a UTC date would already be tomorrow for a US host.
    vi.setSystemTime(new Date(2026, 10, 6, 23, 30));
    const store = configureStore({
      reducer: { [baseApi.reducerPath]: baseApi.reducer },
      middleware: (getDefault) => getDefault().concat(baseApi.middleware),
    });
    const endpoints = (baseApi as unknown as { endpoints: EndpointsMap }).endpoints;
    await store.dispatch(
      endpoints.getGenerateDefaults.initiate({ templateId: "t1", applicantId: "a1" }) as Parameters<typeof store.dispatch>[0],
    );
    expect(mockedApi).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/lease-templates/t1/generate-defaults",
        params: { applicant_id: "a1", today: "2026-11-06" },
      }),
    );
  });
});
