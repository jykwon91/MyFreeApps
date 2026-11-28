import { findEndpointNameClashes } from "@platform/core/utils/findEndpointNameClashes";
import { describe, expect, it } from "vitest";

// The website's own store modules, the shared ones and the api-client's all inject into the one baseApi.
const storeModules = {
  ...import.meta.glob(["@/**/*Api.ts", "!**/__tests__/**"]),
  ...import.meta.glob("@platform/ui/store/*Api.ts"),
  ...import.meta.glob("../../../api-client/src/store/*.ts"),
};

describe("store endpoint names", () => {
  it("are unique across every module the website can inject into baseApi", async () => {
    const paths = Object.keys(storeModules);
    expect(paths.some((path) => path.includes("/shared/store/"))).toBe(true);
    expect(paths.some((path) => path.includes("shared-frontend"))).toBe(true);
    expect(paths.some((path) => path.includes("api-client"))).toBe(true);
    expect(await findEndpointNameClashes(storeModules)).toEqual([]);
  });
});
