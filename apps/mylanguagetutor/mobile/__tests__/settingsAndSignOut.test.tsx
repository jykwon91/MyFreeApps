import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { ACCOUNT_EMAIL, storeSession, storedSession, tokens } from "@platform/mobile/test-support/storedSession";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { WEB_BASE_URL } from "../src/constants/api";
import { SETTINGS_MENU } from "../src/constants/settingsMenu";
import { PRACTICE_TAB, TABS } from "../src/constants/tabs";
import type { AppTab } from "@platform/mobile";
import { renderApp } from "../test-support/renderApp";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const DEVICES = [
  { id: "s1", device_name: "Test Phone", created_at: "2026-10-01T00:00:00Z", last_used_at: "2026-11-01T00:00:00Z" },
  { id: "s9", device_name: "Old iPad", created_at: "2026-09-01T00:00:00Z", last_used_at: "2026-09-02T00:00:00Z" },
];

// How iOS reads out a tab bar item, such as "Settings, tab, 2 of 2".
function tabBarName(tab: AppTab): RegExp {
  return new RegExp(`^${tab.title}, tab, `);
}

const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);

// Each test starts from a phone that signed in before; the app stays open between them.
beforeEach(() => {
  storedItems.clear();
  storeSession();
  openURL.mockClear();
});

it("opens the live website unless a build points it elsewhere", () => {
  const configured = process.env.EXPO_PUBLIC_WEB_BASE_URL;
  delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
  try {
    jest.isolateModules(() => {
      const { WEB_BASE_URL: defaultUrl } = jest.requireActual<typeof import("../src/constants/api")>("../src/constants/api");
      expect(defaultUrl).toBe("https://mylanguagetutor.myfreeapps.org");
    });
  } finally {
    if (configured !== undefined) process.env.EXPO_PUBLIC_WEB_BASE_URL = configured;
  }
});

// One app launch per file, so these run in order: the last one signs out.
describe("the signed-in shell", () => {
  it("has a tab for each main page, and Practice says it's on the website for now", async () => {
    serve({ "POST /auth/mobile/refresh": () => ({ status: 200, data: tokens(1) }) });
    await renderApp();
    expect(await screen.findByRole("header", { name: PRACTICE_TAB.title })).toBeTruthy();
    expect(TABS.filter((tab) => !screen.queryByRole("button", { name: tabBarName(tab) })).map((tab) => tab.title)).toEqual([]);

    await fireEvent.press(screen.getByRole("button", { name: "Open on the website" }));
    expect(openURL).toHaveBeenLastCalledWith(`${WEB_BASE_URL}${PRACTICE_TAB.webPath}`);
  });

  it("links the rest of the website from Settings, with this account's devices", async () => {
    serve({ "GET /auth/mobile/sessions": () => ({ status: 200, data: DEVICES }) });
    await renderApp("/settings");

    expect(await screen.findByText(`Signed in as ${ACCOUNT_EMAIL}`)).toBeTruthy();
    expect(await screen.findByText("Old iPad")).toBeTruthy();
    for (const item of SETTINGS_MENU.flatMap((group) => group.items)) {
      await fireEvent.press(screen.getByRole("link", { name: item.label }));
      expect(openURL).toHaveBeenLastCalledWith(`${WEB_BASE_URL}${item.webPath}`);
    }
  });

  it("signs out of this phone, tells the server, and goes back to sign-in", async () => {
    const sent = serve({
      "GET /auth/mobile/sessions": () => ({ status: 200, data: DEVICES }),
      "POST /auth/mobile/logout": () => ({ status: 204 }),
    });
    await renderApp("/settings");
    await fireEvent.press(await screen.findByRole("button", { name: "Sign out of this phone" }));

    expect(await screen.findByLabelText("Password")).toBeTruthy();
    expect(screen).toHavePathname("/sign-in");
    expect(sent).toContainEqual(expect.objectContaining({ route: "POST /auth/mobile/logout", body: { refresh_token: "r1" } }));
    await waitFor(() => expect(storedSession()).toBeNull());
  });
});
