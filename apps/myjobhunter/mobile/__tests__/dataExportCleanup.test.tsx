import { fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { act, screen, waitFor } from "@testing-library/react-native";
import { clearDataExportFiles } from "../src/lib/dataExportFiles";
import { session } from "../src/lib/session";
import { serve } from "../test-support/fakeServer";
import { renderApp } from "../test-support/renderApp";
import { storeSession, tokens } from "../test-support/storedSession";

jest.mock("expo-secure-store", () => jest.requireActual("../test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("../test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));

const LEFT_BEHIND = "cache:/exports/myjobhunter-export-2026-11-11T09-30-00.json";

// One app launch per file, as the session reads what is stored once: the signed-in test goes first.
describe("a data export left on the phone", () => {
  it("goes with the account when it signs out", async () => {
    storeSession();
    serve({
      "POST /auth/mobile/refresh": () => ({ status: 200, data: tokens(1) }),
      "POST /auth/mobile/logout": () => ({ status: 204 }),
      "GET /auth/mobile/sessions": () => ({ status: 200, data: [] }),
      "GET /auth/totp/status": () => ({ status: 200, data: { enabled: false } }),
    });
    await renderApp("/more");
    await screen.findByRole("button", { name: "Delete account" });
    resetFakeFiles([LEFT_BEHIND]);

    await act(async () => {
      await session.signOut();
    });
    await waitFor(() => expect(fakeFiles()).toEqual([]));
  });

  it("is removed at launch, in case the app was killed while it was open", async () => {
    resetFakeFiles([LEFT_BEHIND, "cache:/other/keep.txt"]);
    serve({});
    await renderApp("/sign-in");
    expect(fakeFiles()).toEqual(["cache:/other/keep.txt"]);
  });

  it("clearing an empty folder is fine", () => {
    resetFakeFiles();
    expect(() => clearDataExportFiles()).not.toThrow();
  });
});
