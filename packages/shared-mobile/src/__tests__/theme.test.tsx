import { render, screen } from "@testing-library/react-native";
import { Text, processColor, useColorScheme } from "react-native";
import { darkColors, lightColors } from "../theme/colors";
import { useTheme } from "../theme/useTheme";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(),
}));

function SchemeProbe() {
  const { isDark, colors } = useTheme();
  return <Text>{`${isDark ? "dark" : "light"} ${colors.background}`}</Text>;
}

describe("theme", () => {
  it.each(Object.entries({ lightColors, darkColors }))(
    "every %s token is a color React Native can parse",
    (_name, colors) => {
      for (const [token, value] of Object.entries(colors)) {
        expect([token, typeof processColor(value)]).toEqual([token, "number"]);
      }
    },
  );

  it("uses the same tokens in both schemes", () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it.each([
    ["dark", `dark ${darkColors.background}`],
    ["light", `light ${lightColors.background}`],
    [null, `light ${lightColors.background}`],
  ])("useTheme follows a system scheme of %s", async (scheme, expected) => {
    jest.mocked(useColorScheme).mockReturnValue(scheme as ReturnType<typeof useColorScheme>);

    await render(<SchemeProbe />);

    expect(screen.getByText(expected)).toBeTruthy();
  });
});
