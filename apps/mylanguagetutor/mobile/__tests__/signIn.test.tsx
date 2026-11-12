import api from "@platform/core/lib/api";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { ACCOUNT_EMAIL, storedSession, tokens } from "@platform/mobile/test-support/storedSession";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { PRACTICE_TAB } from "../src/constants/tabs";
import { session } from "../src/lib/session";
import { renderApp } from "../test-support/renderApp";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const originalAdapter = api.defaults.adapter;

async function submitCredentials(password = "correct horse"): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText("Email"), ACCOUNT_EMAIL);
  await fireEvent.changeText(screen.getByLabelText("Password"), password);
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
}

afterEach(async () => {
  serve({ "POST /auth/mobile/logout": () => ({ status: 204 }) });
  await act(async () => {
    await session.signOut();
  });
  storedItems.clear();
  api.defaults.adapter = originalAdapter;
});

describe("signing in", () => {
  it("opens on the sign-in screen when the phone has no session", async () => {
    serve({});
    await renderApp();
    expect(await screen.findByLabelText("Email")).toBeTruthy();
    expect(screen).toHavePathname("/sign-in");
  });

  it("refuses a wrong password and stays on the sign-in screen", async () => {
    const sent = serve({ "POST /auth/mobile/login": () => ({ status: 400, data: { detail: "LOGIN_BAD_CREDENTIALS" } }) });
    await renderApp();
    await submitCredentials("wrong");

    expect(await screen.findByText("That email or password isn't right. Check them and try again.")).toBeTruthy();
    expect(screen).toHavePathname("/sign-in");
    expect(sent.map((request) => request.route)).toEqual(["POST /auth/mobile/login"]);
    expect(storedSession()).toBeNull();
  });

  it("signs in, keeps the session on the phone, and opens the Practice tab", async () => {
    const sent = serve({ "POST /auth/mobile/login": () => ({ status: 200, data: tokens(1) }) });
    await renderApp();
    await submitCredentials();

    expect(await screen.findByRole("header", { name: PRACTICE_TAB.title })).toBeTruthy();
    expect(screen).toHavePathname("/");
    expect(sent[0].body).toEqual(
      expect.objectContaining({ email: ACCOUNT_EMAIL, password: "correct horse", device_name: "Test Phone" }),
    );
    await waitFor(() => expect(storedSession()).toEqual(expect.objectContaining({ refreshToken: "r1", email: ACCOUNT_EMAIL })));

    // Later requests go out with the access token from sign-in.
    const later = serve({ "GET /users/me": () => ({ status: 200, data: {} }) });
    await api.get("/users/me");
    expect(later[0].authorization).toBe("Bearer a1");
  });

  it("asks for the two-step code, then signs in with it", async () => {
    const sent = serve({
      "POST /auth/mobile/login": (body) =>
        body.totp_code ? { status: 200, data: tokens(2) } : { status: 200, data: { detail: "totp_required" } },
    });
    await renderApp();
    await submitCredentials();

    await fireEvent.changeText(await screen.findByLabelText("Authentication code"), "123456");
    await fireEvent.press(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("header", { name: PRACTICE_TAB.title })).toBeTruthy();
    expect(
      sent.filter((request) => request.route === "POST /auth/mobile/login").map((request) => request.body.totp_code ?? null),
    ).toEqual([null, "123456"]);
    await waitFor(() => expect(storedSession()?.refreshToken).toBe("r2"));
  });

  it("explains a wrong two-step code and keeps the person on the code step", async () => {
    serve({
      "POST /auth/mobile/login": (body) =>
        body.totp_code
          ? { status: 400, data: { detail: "invalid_totp" } }
          : { status: 200, data: { detail: "totp_required" } },
    });
    await renderApp();
    await submitCredentials();

    await fireEvent.changeText(await screen.findByLabelText("Authentication code"), "000000");
    await fireEvent.press(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText(/Each code works once/)).toBeTruthy();
    expect(screen.getByLabelText("Authentication code")).toBeTruthy();
    expect(storedSession()).toBeNull();
  });
});
