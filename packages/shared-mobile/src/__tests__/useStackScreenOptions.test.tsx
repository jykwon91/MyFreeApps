import { render, screen } from "@testing-library/react-native";
import { Text, useColorScheme } from "react-native";
import { useStackScreenOptions } from "../hooks/useStackScreenOptions";
import { darkColors, lightColors } from "../theme/colors";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(),
}));

function OptionsProbe() {
  return <Text>{JSON.stringify(useStackScreenOptions())}</Text>;
}

function expectedFor(colors: typeof lightColors) {
  return {
    headerStyle: { backgroundColor: colors.card },
    headerTintColor: colors.foreground,
    headerTitleStyle: { color: colors.foreground },
    contentStyle: { backgroundColor: colors.background },
  };
}

function shownOptions() {
  return JSON.parse(String(screen.getByText(/headerStyle/).props.children));
}

describe("useStackScreenOptions", () => {
  it.each([
    ["dark", darkColors],
    ["light", lightColors],
    [null, lightColors],
  ])("themes the header and scene for a system scheme of %s", async (scheme, colors) => {
    jest.mocked(useColorScheme).mockReturnValue(scheme as ReturnType<typeof useColorScheme>);

    await render(<OptionsProbe />);

    expect(shownOptions()).toEqual(expectedFor(colors));
  });

  it("follows a switch of the system scheme", async () => {
    jest.mocked(useColorScheme).mockReturnValue("light");
    const view = await render(<OptionsProbe />);
    expect(shownOptions()).toEqual(expectedFor(lightColors));

    jest.mocked(useColorScheme).mockReturnValue("dark");
    await view.rerender(<OptionsProbe />);

    expect(shownOptions()).toEqual(expectedFor(darkColors));
  });
});
