import { baseApi } from "@platform/core/store/baseApi";
import { TWO_STEP_MESSAGES as TWO_STEP } from "@platform/mobile";
import { fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";
import { API_BASE_URL } from "../src/constants/api";
import { DELETE_ACCOUNT_WARNING } from "../src/constants/deleteAccount";
import { SECURITY_INTRO_DISMISSED_KEY, SECURITY_MESSAGES as MESSAGES, WHAT_TWO_STEP_PROTECTS } from "../src/constants/security";
import { store } from "../src/lib/store";
import { alertButton } from "../test-support/alertButton";
import { serve } from "../test-support/fakeServer";
import { storedItems } from "../test-support/memorySecureStore";
import { renderApp } from "../test-support/renderApp";
import { ACCOUNT_EMAIL, storeSession, tokens } from "../test-support/storedSession";
import type { FakeRoute } from "../test-support/types/FakeRoute";

jest.mock("expo-secure-store", () => jest.requireActual("../test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("../test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-screen-capture", () => ({ usePreventScreenCapture: jest.fn() }));
// A phone with no lock: there's nothing to ask, so the owner check passes.
jest.mock("expo-local-authentication", () => ({
  SecurityLevel: { NONE: 0 },
  authenticateAsync: jest.fn(),
  getEnrolledLevelAsync: jest.fn().mockResolvedValue(0),
}));

const USER = { id: "u1", email: ACCOUNT_EMAIL, display_name: "Jane", totp_enabled: false, is_verified: true, is_superuser: false };
const SETUP = { secret: "ABCDEFGHIJ", provisioning_uri: "otpauth://totp/x", algorithm: "sha1", digits: 6, period: 30 };
const CODES = ["AAAA1111", "BBBB2222"];
const share = jest.mocked(Sharing.shareAsync);

/** The account and its two-step sign-in, which turning on and off change. */
function securityRoutes(isTwoStepOn = false, extra: Record<string, FakeRoute> = {}) {
  let enabled = isTwoStepOn;
  return serve({
    "POST /auth/mobile/refresh": () => ({ status: 200, data: tokens(1) }),
    "GET /users/me": () => ({ status: 200, data: USER }),
    "GET /auth/totp/status": () => ({ status: 200, data: { enabled } }),
    "POST /auth/totp/setup": () => ({ status: 200, data: SETUP }),
    "POST /auth/totp/verify": () => {
      enabled = true;
      return { status: 200, data: { recovery_codes: CODES } };
    },
    "POST /auth/totp/disable": () => {
      enabled = false;
      return { status: 200, data: {} };
    },
    ...extra,
  });
}

async function openSecurity(): Promise<void> {
  await renderApp("/security");
  await screen.findByText(TWO_STEP.heading);
}

const alert = jest.spyOn(Alert, "alert");

afterAll(() => store.dispatch(baseApi.util.resetApiState()));

beforeEach(() => {
  storedItems.clear();
  storeSession();
  jest.clearAllMocks();
  alert.mockImplementation(() => undefined);
  resetFakeFiles();
  store.dispatch(baseApi.util.resetApiState());
});

it("opens from More", async () => {
  securityRoutes();
  await renderApp("/more");
  await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.screenTitle }));
  expect(await screen.findByText(TWO_STEP.heading)).toBeTruthy();
  expect(screen).toHavePathname("/security");
});

describe("the two-step intro", () => {
  it("goes when dismissed, and the phone keeps the dismissal", async () => {
    securityRoutes();
    await openSecurity();
    expect(await screen.findByText(MESSAGES.intro)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.dismissIntro }));
    expect(screen.queryByText(MESSAGES.intro)).toBeNull();
    await waitFor(() => expect(storedItems.get(SECURITY_INTRO_DISMISSED_KEY)).toBe("true"));
  });

  it("stays away the next time, once dismissed before", async () => {
    storedItems.set(SECURITY_INTRO_DISMISSED_KEY, "true");
    securityRoutes();
    await openSecurity();
    await screen.findByDisplayValue(USER.display_name);
    expect(screen.queryByText(MESSAGES.intro)).toBeNull();
  });
});

describe("the display name", () => {
  it("shows a skeleton until the account loads", async () => {
    securityRoutes(false, { "GET /users/me": () => new Promise(() => undefined) });
    await openSecurity();
    expect(screen.getByTestId("display-name-skeleton")).toBeTruthy();
  });

  it("saves the trimmed name and says so", async () => {
    const sent = securityRoutes(false, { "PATCH /users/me": (body) => ({ status: 200, data: { ...USER, ...body } }) });
    await openSecurity();
    const save = screen.getByRole("button", { name: MESSAGES.save });
    await fireEvent.changeText(await screen.findByDisplayValue(USER.display_name), "  Jane Smith ");
    await fireEvent.press(save);

    expect(await screen.findByText(MESSAGES.displayNameSaved)).toBeTruthy();
    expect(sent).toContainEqual(expect.objectContaining({ route: "PATCH /users/me", body: { display_name: "Jane Smith" } }));
    expect(screen.getByRole("button", { name: MESSAGES.save }).props.accessibilityState?.disabled).toBe(true);
  });

  it("says when saving failed and keeps what was typed", async () => {
    securityRoutes(false, { "PATCH /users/me": () => ({ status: 500, data: { detail: "boom" } }) });
    await openSecurity();
    await fireEvent.changeText(await screen.findByDisplayValue(USER.display_name), "Jane Smith");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));

    expect(await screen.findByText(MESSAGES.displayNameSaveFailed)).toBeTruthy();
    expect(screen.getByDisplayValue("Jane Smith")).toBeTruthy();
  });

  it("won't save one that's too long", async () => {
    securityRoutes();
    await openSecurity();
    await fireEvent.changeText(await screen.findByDisplayValue(USER.display_name), "x".repeat(101));
    expect(screen.getByText("Keep this to 100 characters or fewer.")).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.save }).props.accessibilityState?.disabled).toBe(true);
  });
});

describe("two-step sign-in", () => {
  it("turns on through the recovery codes, then shows it's on", async () => {
    const sent = securityRoutes(false);
    await openSecurity();
    expect(screen.getByText(TWO_STEP.offBody(WHAT_TWO_STEP_PROTECTS))).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: TWO_STEP.turnOn }));
    await waitFor(() => expect(screen).toHavePathname("/security/turn-on"));
    await fireEvent.changeText(await screen.findByLabelText(TWO_STEP.password), "pw");
    await fireEvent.press(screen.getByRole("button", { name: TWO_STEP.continue }));
    expect(await screen.findByText(TWO_STEP.addHeading("MyJobHunter"))).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(TWO_STEP.codeLabel), "123456");
    await fireEvent.press(screen.getByRole("button", { name: TWO_STEP.confirmTurnOn }));
    expect(await screen.findByText(TWO_STEP.codesHeading)).toBeTruthy();
    CODES.forEach((code) => expect(screen.getByText(code)).toBeTruthy());

    await fireEvent.press(screen.getByRole("checkbox", { name: new RegExp(TWO_STEP.saved) }));
    await fireEvent.press(screen.getByRole("button", { name: TWO_STEP.done }));

    await waitFor(() => expect(screen).toHavePathname("/security"));
    expect(await screen.findByText(TWO_STEP.onBody)).toBeTruthy();
    expect(sent.map(({ route }) => route)).toEqual(expect.arrayContaining(["POST /auth/totp/setup", "POST /auth/totp/verify"]));
    expect(sent.find(({ route }) => route === "POST /auth/totp/setup")?.body).toEqual({ password: "pw" });
  });

  it("turns off with a code from the app", async () => {
    const sent = securityRoutes(true);
    await openSecurity();
    await fireEvent.press(await screen.findByRole("button", { name: TWO_STEP.turnOff }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith(TWO_STEP.turnOffTitle, TWO_STEP.turnOffBody, expect.any(Array)));
    await act(async () => alertButton(TWO_STEP.confirmTurnOff).onPress?.());

    await fireEvent.changeText(await screen.findByLabelText(TWO_STEP.turnOffCodeLabel), "654321");
    await fireEvent.press(screen.getByRole("button", { name: TWO_STEP.confirmTurnOff }));
    expect(await screen.findByText(TWO_STEP.turnedOff)).toBeTruthy();
    expect(await screen.findByText(TWO_STEP.offBody(WHAT_TWO_STEP_PROTECTS))).toBeTruthy();
    expect(sent).toContainEqual(expect.objectContaining({ route: "POST /auth/totp/disable", body: { code: "654321" } }));
  });
});

describe("data & privacy", () => {
  it("exports the account to the share sheet, with the sign-in in a header, and removes the copy", async () => {
    const download = jest.spyOn(File, "downloadFileAsync");
    securityRoutes();
    await openSecurity();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.exportButton }));

    expect(await screen.findByText(MESSAGES.exported)).toBeTruthy();
    const [url, destination, options] = download.mock.calls[0] ?? [];
    expect(url).toBe(`${API_BASE_URL}/users/me/export`);
    expect(options).toEqual(expect.objectContaining({ headers: { Authorization: "Bearer a1" } }));
    expect(destination?.uri).toMatch(/^cache:\/exports\/myjobhunter-export-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);
    expect(share).toHaveBeenCalledWith(destination?.uri, { mimeType: "application/json", UTI: "public.json" });
    expect(fakeFiles()).toEqual([]);
  });

  it("says when the export failed and leaves nothing behind", async () => {
    jest.spyOn(File, "downloadFileAsync").mockRejectedValueOnce(new Error("UnableToDownload: 500"));
    securityRoutes();
    await openSecurity();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.exportButton }));

    expect(await screen.findByText(MESSAGES.exportFailed)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.exported)).toBeNull();
    expect(share).not.toHaveBeenCalled();
    expect(fakeFiles()).toEqual([]);
  });

  it("says only that the export failed when the share sheet fails after the download", async () => {
    share.mockRejectedValueOnce(new Error("Sharing isn't available"));
    securityRoutes();
    await openSecurity();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.exportButton }));

    expect(await screen.findByText(MESSAGES.exportFailed)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.exported)).toBeNull();
    expect(fakeFiles()).toEqual([]);
  });

  it("opens Delete account", async () => {
    securityRoutes();
    await openSecurity();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.deleteButton }));

    expect(await screen.findByText(DELETE_ACCOUNT_WARNING)).toBeTruthy();
    expect(screen).toHavePathname("/delete-account");
  });
});
