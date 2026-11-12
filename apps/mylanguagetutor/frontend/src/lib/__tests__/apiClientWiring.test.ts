import { baseApi } from "@platform/ui";
import "@mylanguagetutor/api-client/store/sessionsApi";
import { describe, expect, it } from "vitest";

// The web store mounts `baseApi` from @platform/ui and the endpoints are injected
// through @platform/core. A second copy of core would leave every hook unmounted.
describe("the tutor API client", () => {
  it("injects into the baseApi the web store mounts", () => {
    expect(Object.keys(baseApi.endpoints)).toContain("createSession");
  });
});
