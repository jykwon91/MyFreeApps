import { fireEvent, render, screen } from "@testing-library/react-native";
import { Appearance, StyleSheet } from "react-native";
import ThemeSettings from "../components/ThemeSettings";
import { THEME_MESSAGES, THEME_OPTIONS, THEME_PREFERENCE, THEME_PREFERENCE_KEY } from "../constants/themePreference";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { chooseThemePreference } from "../theme/themePreferenceStore";
import { storedItems } from "../../test-support/memorySecureStore";

jest.mock("expo-secure-store", () => jest.requireActual("../../test-support/memorySecureStore"));
jest.spyOn(Appearance, "setColorScheme").mockImplementation(() => undefined);

afterEach(() => {
  chooseThemePreference(THEME_PREFERENCE.system);
  storedItems.clear();
});

describe("ThemeSettings", () => {
  it("offers the website's three themes as one choice, with System picked to start", async () => {
    await render(<ThemeSettings />);
    expect(screen.getByRole("header", { name: THEME_MESSAGES.heading })).toBeTruthy();
    expect(screen.getByLabelText(THEME_MESSAGES.heading).props.accessibilityRole).toBe("radiogroup");
    expect(screen.getAllByRole("radio").map((radio) => radio.props.accessibilityState.checked)).toEqual([false, false, true]);
    expect(THEME_OPTIONS.map((option) => option.label)).toEqual(["Light", "Dark", "System"]);
    for (const option of THEME_OPTIONS) {
      expect(screen.getByRole("radio", { name: option.label })).toBeTruthy();
    }
  });

  it("switches to the theme pressed and keeps it for next time", async () => {
    await render(<ThemeSettings />);
    await fireEvent.press(screen.getByRole("radio", { name: "Dark" }));
    expect(screen.getByRole("radio", { name: "Dark", checked: true, selected: true })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "System", checked: false })).toBeTruthy();
    expect(storedItems.get(THEME_PREFERENCE_KEY)).toBe("dark");
  });

  it("is big enough to tap", async () => {
    await render(<ThemeSettings />);
    for (const radio of screen.getAllByRole("radio")) {
      expect(StyleSheet.flatten(radio.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    }
  });
});
