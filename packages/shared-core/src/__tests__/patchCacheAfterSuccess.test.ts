import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _resetPlatformForTests, configurePlatform } from "../platform/configurePlatform";
import { patchCacheAfterSuccess } from "../store/patchCacheAfterSuccess";

let workspace: string | null = "A";

beforeEach(() => {
  workspace = "A";
  configurePlatform({
    baseURL: "https://api.test",
    tokenStore: { get: () => null, set: () => {}, clear: () => {} },
    orgStore: { get: () => workspace },
    isOnLogin: () => false,
  });
});

afterEach(() => {
  _resetPlatformForTests();
});

/** A request whose answer arrives when the test says so. */
function inFlight<Result>() {
  let settle: { resolve: (value: { data: Result }) => void; reject: (error: unknown) => void } | undefined;
  const promise = new Promise<{ data: Result }>((resolve, reject) => {
    settle = { resolve, reject };
  });
  return { promise, settle: settle! };
}

describe("patchCacheAfterSuccess", () => {
  it("patches with the answer when the workspace is unchanged", async () => {
    const patch = vi.fn();
    const request = inFlight<string>();
    const done = patchCacheAfterSuccess(request.promise, patch);
    request.settle.resolve({ data: "saved" });
    await done;
    expect(patch).toHaveBeenCalledWith("saved");
  });

  it("leaves the new workspace's cache alone when the user switched while it was on its way", async () => {
    const patch = vi.fn();
    const request = inFlight<string>();
    const done = patchCacheAfterSuccess(request.promise, patch);
    workspace = "B";
    request.settle.resolve({ data: "saved in A" });
    await done;
    expect(patch).not.toHaveBeenCalled();
  });

  it("patches nothing, and doesn't throw, when the request fails", async () => {
    const patch = vi.fn();
    const request = inFlight<string>();
    const done = patchCacheAfterSuccess(request.promise, patch);
    request.settle.reject(new Error("500"));
    await expect(done).resolves.toBeUndefined();
    expect(patch).not.toHaveBeenCalled();
  });

  it("patches on an app with no workspaces", async () => {
    workspace = null;
    const patch = vi.fn();
    await patchCacheAfterSuccess(Promise.resolve({ data: 1 }), patch);
    expect(patch).toHaveBeenCalledWith(1);
  });
});
