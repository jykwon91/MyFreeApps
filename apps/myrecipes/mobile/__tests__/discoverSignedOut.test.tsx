import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { fireEvent, screen } from "@testing-library/react-native";
import { DISCOVERY_SIGNED_OUT } from "../src/constants/discovery";
import { renderApp } from "../test-support/renderApp";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("expo-notifications", () => jest.requireActual("../test-support/mockNotifications"));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.0.0" } } }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

// Discovery spends a paid web search per query, so like the website it needs an account.
it("explains Discover needs an account and offers sign-in, without searching", async () => {
  storedItems.clear();
  const sent = serve({});
  await renderApp("/discover");

  expect(await screen.findByText(DISCOVERY_SIGNED_OUT.heading)).toBeTruthy();
  expect(screen.queryByLabelText("Dish to search the web for")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  expect(screen).toHavePathname("/sign-in");
  expect(sent.map(({ route }) => route).filter((route) => route.includes("/discovery/"))).toEqual([]);
});
