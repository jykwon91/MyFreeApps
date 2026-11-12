import { SECURITY_MESSAGES as MESSAGES } from "@platform/mobile";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { screen } from "@testing-library/react-native";
import { renderApp } from "../test-support/renderApp";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("expo-notifications", () => jest.requireActual("../test-support/mockNotifications"));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.0.0" } } }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

// MyRecipes works signed out, so Security has to send a signed-out phone somewhere it can sign in.
it("sends a signed-out phone to Settings, which offers sign-in and no Security row", async () => {
  storedItems.clear();
  const sent = serve({});
  await renderApp("/security");

  expect(await screen.findByText("You're not signed in")).toBeTruthy();
  expect(screen).toHavePathname("/settings");
  expect(screen.queryByRole("button", { name: MESSAGES.screenTitle })).toBeNull();
  expect(sent.map(({ route }) => route)).not.toContain("GET /users/me");
});
