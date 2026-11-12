import { screen, waitFor } from "@testing-library/react-native";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { renderApp } from "../test-support/renderApp";
import { storeSession, storedSession } from "@platform/mobile/test-support/storedSession";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

// One app launch per file: the session is read from the phone once, when the app opens.
it("goes back to sign-in, and says why, when the server has ended the stored session", async () => {
  storeSession();
  serve({ "POST /auth/mobile/refresh": () => ({ status: 401, data: { detail: "refresh_invalid" } }) });
  await renderApp();

  expect(await screen.findByText("You've been signed out on this device. Sign in again to continue.")).toBeTruthy();
  expect(screen).toHavePathname("/sign-in");
  await waitFor(() => expect(storedSession()).toBeNull());
});
