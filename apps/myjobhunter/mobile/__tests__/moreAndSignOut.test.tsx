import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { WEB_BASE_URL } from "../src/constants/api";
import { MORE_MENU } from "../src/constants/moreMenu";
import { DASHBOARD_MESSAGES } from "../src/constants/dashboard";
import { APPLICATIONS_TAB, DASHBOARD_TAB, MORE_TAB, TABS } from "../src/constants/tabs";
import type { AppTab } from "../src/types/AppTab";
import { EMPTY_BOARD } from "../test-support/emptyBoard";
import { serve } from "../test-support/fakeServer";
import { storedItems } from "../test-support/memorySecureStore";
import { renderApp } from "../test-support/renderApp";
import { ACCOUNT_EMAIL, storeSession, storedSession, tokens } from "../test-support/storedSession";

jest.mock("expo-secure-store", () => jest.requireActual("../test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("../test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const DEVICES = [
  { id: "s1", device_name: "Test Phone", created_at: "2026-10-01T00:00:00Z", last_used_at: "2026-11-01T00:00:00Z" },
  { id: "s9", device_name: "Old iPad", created_at: "2026-09-01T00:00:00Z", last_used_at: "2026-09-02T00:00:00Z" },
];

// How iOS reads out a tab bar item, such as "Profile, tab, 3 of 4".
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
      expect(defaultUrl).toBe("https://myjobhunter.myfreeapps.org");
    });
  } finally {
    if (configured !== undefined) process.env.EXPO_PUBLIC_WEB_BASE_URL = configured;
  }
});

// One app launch per file, so these run in order: the last one signs out.
describe("the signed-in shell", () => {
  it("has a tab for each main page, each not built yet opening that page on the website", async () => {
    serve({ ...EMPTY_BOARD, "POST /auth/mobile/refresh": () => ({ status: 200, data: tokens(1) }) });
    await renderApp();
    expect(await screen.findByRole("header", { name: DASHBOARD_MESSAGES.noneHeading })).toBeTruthy();
    expect(TABS.filter((tab) => !screen.queryByRole("button", { name: tabBarName(tab) })).map((tab) => tab.title)).toEqual([]);

    for (const tab of TABS.filter((each) => each !== MORE_TAB && each !== APPLICATIONS_TAB && each !== DASHBOARD_TAB)) {
      await fireEvent.press(screen.getByRole("button", { name: tabBarName(tab) }));
      await fireEvent.press(await screen.findByRole("button", { name: "Open on the website" }));
      expect(openURL).toHaveBeenLastCalledWith(`${WEB_BASE_URL}${tab.webPath}`);
    }
  });

  it("lists the rest of the website on More, with this account's devices", async () => {
    serve({ "GET /auth/mobile/sessions": () => ({ status: 200, data: DEVICES }) });
    await renderApp("/more");

    expect(await screen.findByText(`Signed in as ${ACCOUNT_EMAIL}`)).toBeTruthy();
    expect(await screen.findByText("Old iPad")).toBeTruthy();
    for (const item of MORE_MENU.flatMap((group) => group.items).filter((each) => !each.screen)) {
      await fireEvent.press(screen.getByRole("link", { name: item.label }));
      expect(openURL).toHaveBeenLastCalledWith(`${WEB_BASE_URL}${item.webPath}`);
    }
  });

  it("opens the pages the phone has from More on the phone, not the website", async () => {
    serve({
      "GET /auth/mobile/sessions": () => ({ status: 200, data: DEVICES }),
      "GET /companies": () => ({ status: 200, data: { items: [], total: 0 } }),
    });
    await renderApp("/more");

    await fireEvent.press(await screen.findByRole("button", { name: "Companies" }));

    expect(screen).toHavePathname("/companies");
    expect(await screen.findByRole("header", { name: "No companies here yet" })).toBeTruthy();
    expect(openURL).not.toHaveBeenCalled();
  });

  it("signs out of this phone, tells the server, and goes back to sign-in", async () => {
    const sent = serve({
      "GET /auth/mobile/sessions": () => ({ status: 200, data: DEVICES }),
      "POST /auth/mobile/logout": () => ({ status: 204 }),
    });
    await renderApp("/more");
    await fireEvent.press(await screen.findByRole("button", { name: "Sign out of this phone" }));

    expect(await screen.findByLabelText("Password")).toBeTruthy();
    expect(screen).toHavePathname("/sign-in");
    expect(sent).toContainEqual(expect.objectContaining({ route: "POST /auth/mobile/logout", body: { refresh_token: "r1" } }));
    await waitFor(() => expect(storedSession()).toBeNull());
  });
});
