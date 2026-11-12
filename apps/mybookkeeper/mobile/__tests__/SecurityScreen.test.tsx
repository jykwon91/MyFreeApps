import { SECURITY_MESSAGES as MESSAGES, TWO_STEP_MESSAGES as TWO_STEP, ToastProvider } from "@platform/mobile";
import { alertButton } from "@platform/mobile/test-support/alertButton";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import type { FakeRoute } from "@platform/mobile/test-support/types/FakeRoute";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { File } from "expo-file-system";
import { Stack } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import * as Sharing from "expo-sharing";
import { Alert, Text } from "react-native";
import { Provider } from "react-redux";
import SecurityRoute from "../app/(app)/security/index";
import { API_BASE_URL } from "../src/constants/api";
import { SECURITY_CONTENT, SECURITY_INTRO_DISMISSED_KEY } from "../src/constants/security";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { makeStore } from "../src/lib/store";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));
// A phone with no lock: there's nothing to ask, so the owner check passes.
jest.mock("expo-local-authentication", () => ({
  SecurityLevel: { NONE: 0 },
  authenticateAsync: jest.fn(),
  getEnrolledLevelAsync: jest.fn().mockResolvedValue(0),
}));

/** MyBookkeeper's account keeps the name tenants see in `name`, not `display_name`. */
const USER = { id: "u1", email: "me@example.com", name: "Jane", is_active: true, is_verified: true, is_superuser: false, role: "user" };
const share = jest.mocked(Sharing.shareAsync);
const alert = jest.spyOn(Alert, "alert");
let testStore: ReturnType<typeof makeStore>;

function securityRoutes(isTwoStepOn = false, extra: Record<string, FakeRoute> = {}) {
  let enabled = isTwoStepOn;
  return serve({
    "GET /users/me": () => ({ status: 200, data: USER }),
    "GET /auth/totp/status": () => ({ status: 200, data: { enabled } }),
    "POST /auth/totp/disable": () => {
      enabled = false;
      return { status: 200, data: {} };
    },
    ...extra,
  });
}

async function openSecurity(): Promise<ReturnType<typeof renderRouter>> {
  const view = await renderRouter(
    {
      _layout: () => (
        <Provider store={testStore}>
          <ToastProvider bottomOffset={0}>
            <Stack />
          </ToastProvider>
        </Provider>
      ),
      "security/index": SecurityRoute,
      "security/turn-on": () => <Text>turn-on-screen</Text>,
      "delete-account": () => <Text>delete-account-screen</Text>,
    },
    { initialUrl: "/security" },
  );
  await screen.findByText(TWO_STEP.heading);
  return view;
}

/** As the backend answers: a blank name is stored as none. */
const saveName: FakeRoute = (body) => ({ status: 200, data: { ...USER, name: (body.name as string) || null } });

beforeEach(() => {
  storedItems.clear();
  jest.clearAllMocks();
  alert.mockImplementation(() => undefined);
  resetFakeFiles();
  session.tokenStore.set("token");
  testStore = makeStore();
  testStore.dispatch(workspaceChosen("w1"));
});

describe("the two-step intro", () => {
  it("goes when dismissed, and the phone keeps the dismissal", async () => {
    securityRoutes();
    await openSecurity();
    expect(await screen.findByText(SECURITY_CONTENT.intro)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.dismissIntro }));
    expect(screen.queryByText(SECURITY_CONTENT.intro)).toBeNull();
    await waitFor(() => expect(storedItems.get(SECURITY_INTRO_DISMISSED_KEY)).toBe("true"));
  });

  it("stays away the next time, once dismissed before", async () => {
    storedItems.set(SECURITY_INTRO_DISMISSED_KEY, "true");
    securityRoutes();
    await openSecurity();
    await screen.findByDisplayValue(USER.name);
    expect(screen.queryByText(SECURITY_CONTENT.intro)).toBeNull();
  });
});

describe("the display name", () => {
  it("says where tenants see it, and shows a skeleton until the account loads", async () => {
    securityRoutes(false, { "GET /users/me": () => new Promise(() => undefined) });
    await openSecurity();
    expect(screen.getByText(SECURITY_CONTENT.displayNameDescription)).toBeTruthy();
    expect(screen.getByTestId("display-name-skeleton")).toBeTruthy();
  });

  it("starts empty for an account with no name yet", async () => {
    securityRoutes(false, { "GET /users/me": () => ({ status: 200, data: { ...USER, name: null } }) });
    await openSecurity();
    expect(await screen.findByLabelText(MESSAGES.displayNameLabel)).toHaveDisplayValue("");
  });

  it("saves the trimmed name to `name` and says so", async () => {
    const sent = securityRoutes(false, { "PATCH /users/me": saveName });
    await openSecurity();
    await fireEvent.changeText(await screen.findByDisplayValue(USER.name), "  Jane Smith LLC ");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));

    expect(await screen.findByText(MESSAGES.displayNameSaved)).toBeTruthy();
    expect(sent).toContainEqual(expect.objectContaining({ route: "PATCH /users/me", body: { name: "Jane Smith LLC" } }));
    expect(screen.getByRole("button", { name: MESSAGES.save }).props.accessibilityState?.disabled).toBe(true);
  });

  it("shows the saved name when opened again, before the account is read again", async () => {
    let reads = 0;
    securityRoutes(false, {
      // Only the first read answers, so the reopened screen can show only what the save left.
      "GET /users/me": () => (++reads === 1 ? { status: 200, data: USER } : new Promise(() => undefined)),
      "PATCH /users/me": saveName,
    });
    const first = await openSecurity();
    await fireEvent.changeText(await screen.findByDisplayValue(USER.name), "Jane Smith");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));
    await screen.findByText(MESSAGES.displayNameSaved);
    await first.unmount();

    await openSecurity();
    expect(await screen.findByDisplayValue("Jane Smith")).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.save }).props.accessibilityState?.disabled).toBe(true);
  });

  it("saves a cleared name as blank and says so", async () => {
    const sent = securityRoutes(false, { "PATCH /users/me": saveName });
    await openSecurity();
    await fireEvent.changeText(await screen.findByDisplayValue(USER.name), "   ");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));

    expect(await screen.findByText(MESSAGES.displayNameSaved)).toBeTruthy();
    expect(sent).toContainEqual(expect.objectContaining({ route: "PATCH /users/me", body: { name: "" } }));
    expect(screen.getByRole("button", { name: MESSAGES.save }).props.accessibilityState?.disabled).toBe(true);
  });

  it.each([121, 255])("loads a stored %i-character name and says it's too long to save", async (length) => {
    const long = "x".repeat(length);
    securityRoutes(false, { "GET /users/me": () => ({ status: 200, data: { ...USER, name: long } }) });
    await openSecurity();
    expect(await screen.findByDisplayValue(long)).toBeTruthy();
    expect(screen.getByText("Keep this to 120 characters or fewer.")).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.save }).props.accessibilityState?.disabled).toBe(true);
  });

  it("says when saving failed and keeps what was typed", async () => {
    securityRoutes(false, { "PATCH /users/me": () => ({ status: 500, data: { detail: "boom" } }) });
    await openSecurity();
    await fireEvent.changeText(await screen.findByDisplayValue(USER.name), "Jane Smith");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));

    expect(await screen.findByText(MESSAGES.displayNameSaveFailed)).toBeTruthy();
    expect(screen.getByDisplayValue("Jane Smith")).toBeTruthy();
  });

  it("takes up to 120 characters, as the website does", async () => {
    securityRoutes();
    await openSecurity();
    const field = await screen.findByDisplayValue(USER.name);
    await fireEvent.changeText(field, "x".repeat(120));
    expect(screen.getByRole("button", { name: MESSAGES.save }).props.accessibilityState?.disabled).toBe(false);

    await fireEvent.changeText(field, "x".repeat(121));
    expect(screen.getByText("Keep this to 120 characters or fewer.")).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.save }).props.accessibilityState?.disabled).toBe(true);
  });

  it("says when the account couldn't load, and tries again", async () => {
    let fails = true;
    securityRoutes(false, {
      "GET /users/me": () => (fails ? { status: 500, data: { detail: "boom" } } : { status: 200, data: USER }),
    });
    await openSecurity();
    expect(await screen.findByText(MESSAGES.displayNameLoadFailed)).toBeTruthy();

    fails = false;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByDisplayValue(USER.name)).toBeTruthy();
  });
});

describe("two-step sign-in", () => {
  it("goes to turning it on", async () => {
    securityRoutes(false);
    await openSecurity();
    expect(await screen.findByText(TWO_STEP.offBody(SECURITY_CONTENT.whatTwoStepProtects))).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: TWO_STEP.turnOn }));
    expect(await screen.findByText("turn-on-screen")).toBeTruthy();
    expect(screen).toHavePathname("/security/turn-on");
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
    expect(await screen.findByText(TWO_STEP.offBody(SECURITY_CONTENT.whatTwoStepProtects))).toBeTruthy();
    expect(sent).toContainEqual(expect.objectContaining({ route: "POST /auth/totp/disable", body: { code: "654321" } }));
  });
});

describe("data & privacy", () => {
  it("exports the workspace to the share sheet, with the sign-in and workspace in headers, and removes the copy", async () => {
    const download = jest.spyOn(File, "downloadFileAsync");
    securityRoutes();
    await openSecurity();
    expect(screen.getByText(SECURITY_CONTENT.exportDescription)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.exportButton }));

    expect(await screen.findByText(MESSAGES.exported)).toBeTruthy();
    const [url, destination, options] = download.mock.calls[0] ?? [];
    expect(url).toBe(`${API_BASE_URL}/users/me/export`);
    expect(options).toEqual(expect.objectContaining({ headers: { Authorization: "Bearer token", "X-Organization-Id": "w1" } }));
    expect(destination?.uri).toMatch(/^cache:\/exports\/mybookkeeper-export-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);
    expect(share).toHaveBeenCalledWith(destination?.uri, { mimeType: "application/json", UTI: "public.json" });
    expect(fakeFiles()).toEqual([]);
  });

  it("exports the workspace the phone switched to", async () => {
    const download = jest.spyOn(File, "downloadFileAsync");
    securityRoutes();
    await openSecurity();
    await act(async () => {
      testStore.dispatch(workspaceChosen("w2"));
    });
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.exportButton }));

    expect(await screen.findByText(MESSAGES.exported)).toBeTruthy();
    expect(download.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ headers: { Authorization: "Bearer token", "X-Organization-Id": "w2" } }));
  });

  it("says when the export failed and leaves nothing behind", async () => {
    jest.spyOn(File, "downloadFileAsync").mockRejectedValueOnce(new Error("UnableToDownload: 422"));
    securityRoutes();
    await openSecurity();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.exportButton }));

    expect(await screen.findByText(MESSAGES.exportFailed)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.exported)).toBeNull();
    expect(share).not.toHaveBeenCalled();
    expect(fakeFiles()).toEqual([]);
  });

  it("doesn't export when the session couldn't be renewed first", async () => {
    const download = jest.spyOn(File, "downloadFileAsync");
    let fails = false;
    securityRoutes(false, { "GET /users/me": () => (fails ? { status: 500, data: { detail: "boom" } } : { status: 200, data: USER }) });
    await openSecurity();
    await screen.findByDisplayValue(USER.name);

    fails = true;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.exportButton }));
    expect(await screen.findByText(MESSAGES.exportFailed)).toBeTruthy();
    expect(download).not.toHaveBeenCalled();
  });

  it("opens Delete account", async () => {
    securityRoutes();
    await openSecurity();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.deleteButton }));

    expect(await screen.findByText("delete-account-screen")).toBeTruthy();
    expect(screen).toHavePathname("/delete-account");
    // So its Back says Security, not More.
    expect(screen).toHaveSearchParams({ from: "security" });
  });
});
