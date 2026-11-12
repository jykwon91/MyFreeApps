import { render, screen } from "@testing-library/react-native";
import { Text, useColorScheme } from "react-native";
import { useTabScreenOptions } from "../hooks/useTabScreenOptions";
import { darkColors, lightColors } from "../theme/colors";
import type { TabScreenOptionsSettings } from "../types/TabScreenOptionsSettings";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(),
}));

function OptionsProbe({ settings }: { settings?: TabScreenOptionsSettings }) {
  return <Text>{JSON.stringify(useTabScreenOptions(settings))}</Text>;
}

function expectedFor(colors: typeof lightColors) {
  return {
    headerStyle: { backgroundColor: colors.card },
    headerTintColor: colors.foreground,
    tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.mutedForeground,
    tabBarIconStyle: { display: "none" },
    sceneStyle: { backgroundColor: colors.background },
  };
}

function shownOptions() {
  return JSON.parse(String(screen.getByText(/headerStyle/).props.children));
}

describe("useTabScreenOptions", () => {
  it.each([
    ["dark", darkColors],
    ["light", lightColors],
    [null, lightColors],
  ])("themes the header, tab bar and scene for a system scheme of %s", async (scheme, colors) => {
    jest.mocked(useColorScheme).mockReturnValue(scheme as ReturnType<typeof useColorScheme>);

    await render(<OptionsProbe />);

    expect(shownOptions()).toEqual(expectedFor(colors));
  });

  it("shows the tab icons when asked to", async () => {
    jest.mocked(useColorScheme).mockReturnValue("light");

    await render(<OptionsProbe settings={{ showIcons: true }} />);

    const { tabBarIconStyle: _hidden, ...withIcons } = expectedFor(lightColors);
    expect(shownOptions()).toEqual(withIcons);
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
