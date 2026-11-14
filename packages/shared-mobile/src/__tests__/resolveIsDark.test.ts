import { THEME_PREFERENCE } from "../constants/themePreference";
import { resolveIsDark } from "../utils/resolveIsDark";

describe("resolveIsDark", () => {
  it.each([
    [THEME_PREFERENCE.system, "dark", true],
    [THEME_PREFERENCE.system, "light", false],
    [THEME_PREFERENCE.system, null, false],
    [THEME_PREFERENCE.system, undefined, false],
    [THEME_PREFERENCE.dark, "light", true],
    [THEME_PREFERENCE.dark, null, true],
    [THEME_PREFERENCE.light, "dark", false],
    [THEME_PREFERENCE.light, null, false],
  ] as const)("a %s choice with the phone %s is dark: %s", (preference, systemScheme, expected) => {
    expect(resolveIsDark(preference, systemScheme)).toBe(expected);
  });
});
