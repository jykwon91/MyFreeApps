import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import LoadingButton from "../components/LoadingButton";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: Error) => void;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  let reject: (reason: Error) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("LoadingButton", () => {
  it("calls onPress and stays idle for synchronous work", async () => {
    const onPress = jest.fn();
    await render(<LoadingButton onPress={onPress}>Save</LoadingButton>);

    await fireEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("loading-button-spinner")).toBeNull();
    expect(screen.getByRole("button").props.accessibilityState).toMatchObject({
      disabled: false,
      busy: false,
    });
  });

  it("shows loading at press time, before the work finishes, then recovers", async () => {
    const work = deferred();
    await render(
      <LoadingButton loadingText="Saving..." onPress={() => work.promise}>
        Save
      </LoadingButton>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByTestId("loading-button-spinner")).toBeTruthy();
    expect(screen.getByText("Saving...")).toBeTruthy();
    expect(screen.queryByText("Save")).toBeNull();
    expect(screen.getByRole("button").props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true,
    });

    await act(async () => {
      work.resolve();
      await work.promise;
    });

    expect(screen.queryByTestId("loading-button-spinner")).toBeNull();
    expect(screen.getByText("Save")).toBeTruthy();
    expect(screen.getByRole("button").props.accessibilityState).toMatchObject({ busy: false });
  });

  it("ignores a second press while the first is in flight", async () => {
    const work = deferred();
    const onPress = jest.fn(() => work.promise);
    await render(<LoadingButton onPress={onPress}>Save</LoadingButton>);
    const button = screen.getByRole("button");

    // Both land before React re-renders, which is what a real double tap does.
    await act(async () => {
      button.props.onClick();
      button.props.onClick();
    });

    expect(onPress).toHaveBeenCalledTimes(1);
    await act(async () => {
      work.resolve();
      await work.promise;
    });
  });

  it("recovers after the work rejects and doesn't swallow the rejection", async () => {
    const failure = new Error("boom");
    const realFinally = Promise.prototype.finally;
    let outcome: Promise<unknown> | undefined;
    const spy = jest.spyOn(Promise.prototype, "finally").mockImplementation(function (
      this: Promise<unknown>,
      onFinally,
    ) {
      outcome = realFinally.call(this, onFinally);
      // Jest fails any test with an unhandled rejection, which is what the button
      // leaves behind on purpose. Mark this one handled so it can be asserted on.
      outcome.catch(() => undefined);
      return outcome;
    });
    await render(<LoadingButton onPress={() => Promise.reject(failure)}>Save</LoadingButton>);

    await fireEvent.press(screen.getByRole("button", { name: "Save" }));

    await expect(outcome).rejects.toBe(failure);
    spy.mockRestore();
    await act(async () => undefined);
    expect(screen.queryByTestId("loading-button-spinner")).toBeNull();
    expect(screen.getByRole("button").props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("shows loading from isLoading and doesn't fire", async () => {
    const onPress = jest.fn();
    await render(
      <LoadingButton isLoading onPress={onPress}>
        Save
      </LoadingButton>,
    );

    await fireEvent.press(screen.getByRole("button"));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId("loading-button-spinner")).toBeTruthy();
    // No loadingText: the label stays, so the width doesn't jump.
    expect(screen.getByText("Save")).toBeTruthy();
  });

  it("doesn't fire when disabled", async () => {
    const onPress = jest.fn();
    await render(
      <LoadingButton disabled onPress={onPress}>
        Save
      </LoadingButton>,
    );

    await fireEvent.press(screen.getByRole("button"));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.queryByTestId("loading-button-spinner")).toBeNull();
  });

  it.each(["primary", "secondary", "ghost", "destructive"] as const)(
    "%s meets the minimum touch target",
    async (variant) => {
      await render(
        <LoadingButton onPress={jest.fn()} variant={variant}>
          OK
        </LoadingButton>,
      );

      const style = StyleSheet.flatten(screen.getByRole("button").props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      expect(style.minWidth).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    },
  );
});
