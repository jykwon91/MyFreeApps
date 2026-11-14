import { act, render, screen, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { Appearance, Text, useColorScheme } from "react-native";
import { THEME_PREFERENCE, THEME_PREFERENCE_KEY } from "../constants/themePreference";
import { darkColors, lightColors } from "../theme/colors";
import { chooseThemePreference, getThemePreference, restoreThemePreference } from "../theme/themePreferenceStore";
import { useTheme } from "../theme/useTheme";
import { storedItems } from "../../test-support/memorySecureStore";

jest.mock("expo-secure-store", () => jest.requireActual("../../test-support/memorySecureStore"));
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const setColorScheme = jest.spyOn(Appearance, "setColorScheme").mockImplementation(() => undefined);

function SchemeProbe() {
  const { isDark, colors } = useTheme();
  return <Text>{`${isDark ? "dark" : "light"} ${colors.background}`}</Text>;
}

afterEach(() => {
  chooseThemePreference(THEME_PREFERENCE.system);
  storedItems.clear();
  setColorScheme.mockClear();
});

describe("the theme preference", () => {
  it("follows the phone until a choice is made", async () => {
    jest.mocked(useColorScheme).mockReturnValue("dark");
    await render(<SchemeProbe />);
    expect(getThemePreference()).toBe(THEME_PREFERENCE.system);
    expect(screen.getByText(`dark ${darkColors.background}`)).toBeTruthy();
  });

  it.each([
    [THEME_PREFERENCE.light, "dark", `light ${lightColors.background}`],
    [THEME_PREFERENCE.dark, "light", `dark ${darkColors.background}`],
  ] as const)("a %s choice wins over the phone being %s, on every screen at once", async (choice, system, expected) => {
    jest.mocked(useColorScheme).mockReturnValue(system);
    await render(
      <>
        <SchemeProbe />
        <SchemeProbe />
      </>,
    );
    await act(async () => chooseThemePreference(choice));
    expect(screen.getAllByText(expected)).toHaveLength(2);
  });

  it("keeps the choice on the phone and has the system draw the app to match", async () => {
    chooseThemePreference(THEME_PREFERENCE.dark);
    expect(storedItems.get(THEME_PREFERENCE_KEY)).toBe("dark");
    expect(setColorScheme).toHaveBeenLastCalledWith("dark");

    chooseThemePreference(THEME_PREFERENCE.system);
    expect(storedItems.get(THEME_PREFERENCE_KEY)).toBe("system");
    expect(setColorScheme).toHaveBeenLastCalledWith("auto");
  });

  it("puts back the choice made before", async () => {
    storedItems.set(THEME_PREFERENCE_KEY, "light");
    jest.mocked(useColorScheme).mockReturnValue("dark");
    await render(<SchemeProbe />);
    await act(() => restoreThemePreference());
    expect(screen.getByText(`light ${lightColors.background}`)).toBeTruthy();
    expect(setColorScheme).toHaveBeenLastCalledWith("light");
  });

  it("follows the phone if what was kept isn't a theme", async () => {
    storedItems.set(THEME_PREFERENCE_KEY, "sepia");
    await restoreThemePreference();
    expect(getThemePreference()).toBe(THEME_PREFERENCE.system);
  });

  it("follows the phone if the phone won't give the choice up", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(SecureStore, "getItemAsync").mockRejectedValueOnce(new Error("locked"));
    await restoreThemePreference();
    expect(getThemePreference()).toBe(THEME_PREFERENCE.system);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("still changes the theme when it can't be kept for next time", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(SecureStore, "setItemAsync").mockRejectedValueOnce(new Error("full"));
    chooseThemePreference(THEME_PREFERENCE.dark);
    expect(getThemePreference()).toBe(THEME_PREFERENCE.dark);
    await waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });

  it("lets a choice made while the old one is being read win", async () => {
    storedItems.set(THEME_PREFERENCE_KEY, "light");
    const restoring = restoreThemePreference();
    chooseThemePreference(THEME_PREFERENCE.dark);
    await restoring;
    expect(getThemePreference()).toBe(THEME_PREFERENCE.dark);
  });
});
