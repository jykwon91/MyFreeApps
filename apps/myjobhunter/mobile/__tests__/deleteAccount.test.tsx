import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { DELETE_ACCOUNT_WARNING } from "../src/constants/deleteAccount";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { renderApp } from "../test-support/renderApp";
import { ACCOUNT_EMAIL, storeSession, storedSession, tokens } from "@platform/mobile/test-support/storedSession";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

storeSession();

// One app launch per file, so these run in order: the last one deletes the account.
describe("deleting the account", () => {
  it("opens from More and says what goes with it", async () => {
    serve({
      "POST /auth/mobile/refresh": () => ({ status: 200, data: tokens(1) }),
      "GET /auth/mobile/sessions": () => ({ status: 200, data: [] }),
      "GET /auth/totp/status": () => ({ status: 200, data: { enabled: false } }),
    });
    await renderApp("/more");
    await fireEvent.press(await screen.findByRole("button", { name: "Delete account" }));

    expect(await screen.findByText(DELETE_ACCOUNT_WARNING)).toBeTruthy();
    expect(screen).toHavePathname("/delete-account");
  });

  it("keeps the account when the password is wrong", async () => {
    serve({
      "GET /auth/totp/status": () => ({ status: 200, data: { enabled: false } }),
      "DELETE /users/me": () => ({ status: 400, data: { detail: "Incorrect password" } }),
    });
    await renderApp("/delete-account");
    await fireEvent.changeText(await screen.findByLabelText("Type your email to confirm"), ACCOUNT_EMAIL);
    await fireEvent.changeText(screen.getByLabelText("Password"), "wrong");
    await fireEvent.press(screen.getByRole("button", { name: "Delete my account forever" }));

    expect(await screen.findByText("That password isn't right.")).toBeTruthy();
    expect(storedSession()).not.toBeNull();
  });

  it("asks MyJobHunter to delete it with the password and email, then signs the phone out", async () => {
    const sent = serve({
      "GET /auth/totp/status": () => ({ status: 200, data: { enabled: false } }),
      "DELETE /users/me": () => ({ status: 204 }),
    });
    await renderApp("/delete-account");
    await fireEvent.changeText(await screen.findByLabelText("Type your email to confirm"), ACCOUNT_EMAIL);
    await fireEvent.changeText(screen.getByLabelText("Password"), "correct horse");
    await fireEvent.press(screen.getByRole("button", { name: "Delete my account forever" }));

    expect(await screen.findByText("Your account has been deleted.")).toBeTruthy();
    expect(screen).toHavePathname("/sign-in");
    expect(sent).toContainEqual(
      expect.objectContaining({
        route: "DELETE /users/me",
        body: { password: "correct horse", confirm_email: ACCOUNT_EMAIL, totp_code: null },
      }),
    );
    await waitFor(() => expect(storedSession()).toBeNull());
  });
});
