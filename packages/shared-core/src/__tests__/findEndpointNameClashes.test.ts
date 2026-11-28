import { describe, expect, it } from "vitest";
import { baseApi } from "../store/baseApi";
import { findEndpointNameClashes } from "../utils/findEndpointNameClashes";

function injecting(name: string) {
  return async () => baseApi.injectEndpoints({ endpoints: (build) => ({ [name]: build.query<void, void>({ query: () => ({ url: `/${name}` }) }) }) });
}

describe("findEndpointNameClashes", () => {
  it("finds nothing when every module's endpoint names are its own", async () => {
    expect(await findEndpointNameClashes({ "a.ts": injecting("clashFreeOne"), "b.ts": injecting("clashFreeTwo") })).toEqual([]);
  });

  it("names the module whose endpoint another module already injected", async () => {
    const clashes = await findEndpointNameClashes({ "first.ts": injecting("sharedName"), "second.ts": injecting("sharedName") });
    expect(clashes).toHaveLength(1);
    expect(clashes[0]).toMatch(/^second\.ts: .*sharedName/);
  });

  it("puts baseApi back as it was afterwards", async () => {
    const before = baseApi.injectEndpoints;
    await findEndpointNameClashes({ "a.ts": injecting("restoredCheck") });
    expect(baseApi.injectEndpoints).toBe(before);
  });
});
