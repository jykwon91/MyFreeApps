import { describe, expect, it, vi } from "vitest";
import { useSubmitOnce } from "../hooks/useSubmitOnce";

// No renderer in this package: a ref that holds its value and a callback that returns what it's
// given are all the hook needs from React, standing in for one mounted component.
vi.mock("react", () => {
  const ref = { current: false };
  return { useRef: () => ref, useCallback: <T>(fn: T) => fn };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useSubmitOnce", () => {
  it("ignores a second call while the first is still pending", async () => {
    const submitOnce = useSubmitOnce();
    const first = deferred<string>();
    const submit = vi.fn(() => first.promise);

    const running = submitOnce(submit);
    const ignored = await submitOnce(submit);

    expect(ignored).toBeUndefined();
    expect(submit).toHaveBeenCalledTimes(1);
    first.resolve("done");
    expect(await running).toBe("done");
  });

  it("releases once the call succeeds", async () => {
    const submitOnce = useSubmitOnce();
    const submit = vi.fn().mockResolvedValue("ok");

    await submitOnce(submit);
    await submitOnce(submit);

    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("releases once the call is rejected, and passes the rejection on", async () => {
    const submitOnce = useSubmitOnce();
    const failing = vi.fn().mockRejectedValue(new Error("no"));
    const retry = vi.fn().mockResolvedValue("ok");

    await expect(submitOnce(failing)).rejects.toThrow("no");
    expect(await submitOnce(retry)).toBe("ok");
  });
});
