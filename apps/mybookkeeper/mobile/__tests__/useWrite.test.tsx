import { act, renderHook } from "@testing-library/react-native";
import { useWrite } from "../src/lib/useWrite";
import type { WriteResult } from "../src/types/WriteResult";

// What RTK Query rejects with when a sign-out or workspace switch aborts the request.
const aborted = () => Promise.reject({ name: "AbortError", message: "Aborted" });

describe("useWrite", () => {
  it("says a write a cache reset called off was cancelled, records no failure, and lets the next one through", async () => {
    const { result } = await renderHook(() => useWrite());

    let outcome: WriteResult | undefined;
    await act(async () => {
      outcome = await result.current.run(aborted);
    });
    expect(outcome).toBe("cancelled");
    expect(result.current.failure).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isBusy).toBe(false);

    await act(async () => {
      outcome = await result.current.run(async () => undefined);
    });
    expect(outcome).toBe("done");
  });

  it("still records why a genuine failure happened", async () => {
    const { result } = await renderHook(() => useWrite());
    const refused = { status: 500, data: { detail: "boom" } };

    let outcome: WriteResult | undefined;
    await act(async () => {
      outcome = await result.current.run(() => Promise.reject(refused));
    });
    expect(outcome).not.toBe("cancelled");
    expect(outcome).not.toBe("done");
    expect(result.current.failure).toBe(outcome);
    expect(result.current.error).toBe(refused);
  });
});
