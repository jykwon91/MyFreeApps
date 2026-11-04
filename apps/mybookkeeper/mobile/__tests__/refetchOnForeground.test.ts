import { AppState } from "react-native";
import { refetchOnForeground } from "../src/lib/refetchOnForeground";

it("tells the API layer when the app leaves and comes back", () => {
  const listeners: ((state: string) => void)[] = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, listener: (state: string) => void) => {
    listeners.push(listener);
    return { remove: jest.fn() };
  }) as unknown as typeof AppState.addEventListener);
  const dispatch = jest.fn();
  refetchOnForeground(dispatch);
  listeners[0]("background");
  expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: "__rtkq/unfocused" }));
  listeners[0]("active");
  expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: "__rtkq/focused" }));
});
