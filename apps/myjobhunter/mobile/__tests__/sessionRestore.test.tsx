import api from "@platform/core/lib/api";
import { screen, waitFor } from "@testing-library/react-native";
import { DASHBOARD_MESSAGES } from "../src/constants/dashboard";
import { EMPTY_BOARD } from "../test-support/emptyBoard";
import { serve } from "../test-support/fakeServer";
import { renderApp } from "../test-support/renderApp";
import { ACCOUNT_EMAIL, storeSession, storedSession, tokens } from "../test-support/storedSession";

jest.mock("expo-secure-store", () => jest.requireActual("../test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("../test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

// One app launch per file: the session is read from the phone once, when the app opens.
it("reopens signed in after a restart, and swaps the stored token for a fresh one", async () => {
  storeSession();
  const sent = serve({ ...EMPTY_BOARD, "POST /auth/mobile/refresh": () => ({ status: 200, data: tokens(5) }) });
  await renderApp();

  expect(await screen.findByRole("header", { name: DASHBOARD_MESSAGES.noneHeading })).toBeTruthy();
  expect(screen.queryByLabelText("Password")).toBeNull();
  await waitFor(() => expect(storedSession()).toEqual(expect.objectContaining({ refreshToken: "r5", email: ACCOUNT_EMAIL })));
  expect(sent[0]).toEqual(expect.objectContaining({ route: "POST /auth/mobile/refresh", body: { refresh_token: "r0" } }));

  const later = serve({ "GET /users/me": () => ({ status: 200, data: {} }) });
  await api.get("/users/me");
  expect(later[0].authorization).toBe("Bearer a5");
});
