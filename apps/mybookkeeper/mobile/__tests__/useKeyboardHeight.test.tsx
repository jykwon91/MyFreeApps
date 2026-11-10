import { act, renderHook } from "@testing-library/react-native";
import { Keyboard } from "react-native";
import { useKeyboardHeight } from "../src/lib/useKeyboardHeight";

type Handler = (event: { endCoordinates: { height: number } }) => void;

describe("useKeyboardHeight", () => {
  it("follows the keyboard up and down, and stops listening when unmounted", async () => {
    const handlers: Record<string, Handler> = {};
    const remove = jest.fn();
    jest.spyOn(Keyboard, "addListener").mockImplementation(((name: string, handler: Handler) => {
      handlers[name] = handler;
      return { remove };
    }) as unknown as typeof Keyboard.addListener);

    const { result, unmount } = await renderHook(() => useKeyboardHeight());
    expect(result.current).toBe(0);
    await act(async () => handlers.keyboardDidShow({ endCoordinates: { height: 300 } }));
    expect(result.current).toBe(300);
    await act(async () => handlers.keyboardDidHide({ endCoordinates: { height: 0 } }));
    expect(result.current).toBe(0);
    await unmount();
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
