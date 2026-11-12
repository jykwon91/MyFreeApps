import { clearDataExportFiles } from "@platform/mobile";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { storeSession, tokens } from "@platform/mobile/test-support/storedSession";
import { act, screen, waitFor } from "@testing-library/react-native";
import { session } from "../src/lib/session";
import { renderApp } from "../test-support/renderApp";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("expo-notifications", () => jest.requireActual("../test-support/mockNotifications"));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.0.0" } } }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));

const LEFT_BEHIND = "cache:/exports/myrecipes-export-2026-11-11T09-30-00.json";

// One app launch per file, as the session reads what is stored once: the signed-in test goes first.
describe("a data export left on the phone", () => {
  it("goes with the account when it signs out", async () => {
    storeSession();
    serve({
      "POST /auth/mobile/refresh": () => ({ status: 200, data: tokens(1) }),
      "POST /auth/mobile/logout": () => ({ status: 204 }),
      "GET /auth/mobile/sessions": () => ({ status: 200, data: [] }),
    });
    await renderApp("/settings");
    await screen.findByRole("button", { name: "Security" });
    resetFakeFiles([LEFT_BEHIND]);

    await act(async () => {
      await session.signOut();
    });
    await waitFor(() => expect(fakeFiles()).toEqual([]));
  });

  it("is removed at launch, in case the app was killed while it was open", async () => {
    resetFakeFiles([LEFT_BEHIND, "cache:/other/keep.txt"]);
    serve({});
    await renderApp("/settings");
    expect(fakeFiles()).toEqual(["cache:/other/keep.txt"]);
  });

  it("clearing an empty folder is fine", () => {
    resetFakeFiles();
    expect(() => clearDataExportFiles()).not.toThrow();
  });
});
