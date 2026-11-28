import { baseApi } from "@platform/core/store/baseApi";
import { afterEach, describe, expect, it, vi } from "vitest";

// Every store module injects its endpoints into the one shared baseApi. Two modules using the same endpoint name
// don't both work: the second injection is skipped, so its hook calls the first module's URL. RTK Query only
// reports that in development, so here every injection is made to throw on a name already taken.
const storeModules = import.meta.glob("../store/*.ts");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("store endpoint names", () => {
  it("are unique across every module that injects into baseApi", async () => {
    const inject = baseApi.injectEndpoints.bind(baseApi);
    vi.spyOn(baseApi, "injectEndpoints").mockImplementation((options) => inject({ ...options, overrideExisting: "throw" }));
    expect(Object.keys(storeModules)).not.toHaveLength(0);
    for (const [path, load] of Object.entries(storeModules)) {
      await expect(load(), path).resolves.toBeDefined();
    }
  });
});
