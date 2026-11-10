import { darkColors, lightColors } from "@platform/mobile";
import { render } from "@testing-library/react-native";
import { Stack } from "expo-router";
import { useColorScheme } from "react-native";
import AppLayout from "../app/(app)/_layout";

jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("expo-router", () => {
  const MockStack = Object.assign(jest.fn(() => null), { Screen: () => null });
  return { Stack: MockStack };
});
jest.mock("../src/features/capture/useResumeUploads", () => ({ useResumeUploads: jest.fn() }));
jest.mock("../src/features/shell/PrivacyCover", () => ({ __esModule: true, default: () => null }));
jest.mock("../src/features/workspace/WorkspaceGate", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("../src/features/workspace/WorkspaceLostToast", () => ({ __esModule: true, default: () => null }));

function lastStackOptions() {
  const calls = jest.mocked(Stack).mock.calls;
  return (calls[calls.length - 1][0] as { screenOptions: Record<string, unknown> }).screenOptions;
}

describe("the signed-in layout", () => {
  it.each([
    ["dark", darkColors],
    ["light", lightColors],
  ])("gives pushed screens a %s header", async (scheme, colors) => {
    jest.mocked(useColorScheme).mockReturnValue(scheme as ReturnType<typeof useColorScheme>);

    await render(<AppLayout />);

    expect(lastStackOptions()).toMatchObject({
      headerShown: false,
      headerStyle: { backgroundColor: colors.card },
      headerTintColor: colors.foreground,
      headerTitleStyle: { color: colors.foreground },
      contentStyle: { backgroundColor: colors.background },
    });
  });
});
