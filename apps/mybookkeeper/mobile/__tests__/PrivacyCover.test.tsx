import { act, render, screen } from "@testing-library/react-native";
import { AppState } from "react-native";
import PrivacyCover from "../src/features/shell/PrivacyCover";

describe("PrivacyCover", () => {
  it("covers the screen when the app leaves the foreground, and uncovers on return", async () => {
    let listener: ((state: string) => void) | undefined;
    const remove = jest.fn();
    Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, callback) => {
      listener = callback as (state: string) => void;
      return { remove };
    });
    const { unmount } = await render(<PrivacyCover />);
    expect(screen.queryByTestId("privacy-cover", { includeHiddenElements: true })).toBeNull();
    await act(async () => listener?.("inactive"));
    expect(screen.getByTestId("privacy-cover", { includeHiddenElements: true })).toBeTruthy();
    await act(async () => listener?.("active"));
    expect(screen.queryByTestId("privacy-cover", { includeHiddenElements: true })).toBeNull();
    await unmount();
    expect(remove).toHaveBeenCalled();
  });
});
