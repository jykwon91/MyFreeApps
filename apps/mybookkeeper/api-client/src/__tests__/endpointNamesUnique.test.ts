import { findEndpointNameClashes } from "@platform/core/utils/findEndpointNameClashes";
import { describe, expect, it } from "vitest";

const storeModules = import.meta.glob("../store/*.ts");

describe("store endpoint names", () => {
  it("are unique across every module that injects into baseApi", async () => {
    expect(Object.keys(storeModules)).not.toHaveLength(0);
    expect(await findEndpointNameClashes(storeModules)).toEqual([]);
  });
});
