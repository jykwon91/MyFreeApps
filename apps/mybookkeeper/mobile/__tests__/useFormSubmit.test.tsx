import { act, renderHook } from "@testing-library/react-native";
import { useFormSubmit } from "../src/features/shell/useFormSubmit";

describe("useFormSubmit", () => {
  it("resolves true and stays clear when the save lands", async () => {
    const { result } = await renderHook(() => useFormSubmit());

    let landed = false;
    await act(async () => {
      landed = await result.current.submit(async () => undefined, () => "failed");
    });

    expect(landed).toBe(true);
    expect(result.current.isBusy).toBe(false);
    expect(result.current.failure).toBeNull();
  });

  it("resolves false with the described failure, then clears it on the next try", async () => {
    const { result } = await renderHook(() => useFormSubmit());

    let landed = true;
    await act(async () => {
      landed = await result.current.submit(() => Promise.reject(new Error("no")), (error) => `Failed: ${(error as Error).message}`);
    });
    expect(landed).toBe(false);
    expect(result.current.failure).toBe("Failed: no");
    expect(result.current.isBusy).toBe(false);

    await act(async () => {
      await result.current.submit(async () => undefined, () => "failed");
    });
    expect(result.current.failure).toBeNull();
  });

  it("is busy while saving and refuses a second save started in the same moment", async () => {
    const { result } = await renderHook(() => useFormSubmit());
    let finish: () => void = () => undefined;
    const save = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));

    let first: Promise<boolean> = Promise.resolve(false);
    let second = true;
    await act(async () => {
      first = result.current.submit(save, () => "failed");
      second = await result.current.submit(save, () => "failed");
    });

    expect(second).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.isBusy).toBe(true);

    await act(async () => {
      finish();
      await first;
    });
    expect(result.current.isBusy).toBe(false);
  });

  it("clears a failure on request", async () => {
    const { result } = await renderHook(() => useFormSubmit());
    await act(async () => {
      await result.current.submit(() => Promise.reject(new Error("no")), () => "failed");
    });

    await act(async () => result.current.clearFailure());

    expect(result.current.failure).toBeNull();
  });
});
