import { darkColors, lightColors } from "@platform/mobile";
import { render } from "@testing-library/react-native";
import { Stack } from "expo-router";
import { useColorScheme } from "react-native";
import AppLayout from "../app/(app)/_layout";

jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("expo-router", () => ({ Stack: jest.fn(() => null) }));

describe("the signed-in layout header", () => {
  it.each([
    ["dark", darkColors],
    ["light", lightColors],
  ])("follows a %s system scheme", async (scheme, colors) => {
    jest.mocked(useColorScheme).mockReturnValue(scheme as ReturnType<typeof useColorScheme>);

    await render(<AppLayout />);

    const calls = jest.mocked(Stack).mock.calls;
    expect((calls[calls.length - 1][0] as { screenOptions: unknown }).screenOptions).toMatchObject({
      headerStyle: { backgroundColor: colors.card },
      headerTintColor: colors.foreground,
      contentStyle: { backgroundColor: colors.background },
    });
  });
});
