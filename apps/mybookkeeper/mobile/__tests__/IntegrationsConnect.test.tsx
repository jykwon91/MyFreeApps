import api from "@platform/core/lib/api";
import { fireEvent, screen } from "@testing-library/react-native";
import { openAuthSessionAsync } from "expo-web-browser";
import { GMAIL_CONNECT_FAILURE_MESSAGES } from "@mybookkeeper/api-client/constants/gmailConnect";
import { GMAIL_CONNECT_MESSAGES as CONNECT, GMAIL_CONNECT_RETURN_URL } from "../src/constants/gmailConnect";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../src/constants/integrations";
import IntegrationsScreen from "../src/features/integrations/IntegrationsScreen";
import type { FakeIntegrationsServer } from "../test-support/FakeIntegrationsServer";
import { GMAIL_COMPLETE_URL, GOOGLE_ANSWER_QUERY } from "../test-support/googleAuthUrl";
import { aGmail, startIntegrationsServer, writesMade } from "../test-support/integrationsServer";
import { renderScreen, resetSignedInStore } from "../test-support/renderScreen";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));

const openBrowser = jest.mocked(openAuthSessionAsync);
const originalAdapter = api.defaults.adapter;

/** Google's sign-in finishing: the browser comes back to the app with Google's answer, which the app finishes and the server saves. */
function signInConnects(server: FakeIntegrationsServer): void {
  openBrowser.mockImplementation(async () => {
    server.integrations = [aGmail()];
    return { type: "success", url: `${GMAIL_CONNECT_RETURN_URL}?${GOOGLE_ANSWER_QUERY}` };
  });
}

beforeEach(() => {
  resetSignedInStore();
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("connecting Gmail from the phone", () => {
  it("connects it here and shows it connected, without sending anyone to the website", async () => {
    const server = startIntegrationsServer({ integrations: [] });
    signInConnects(server);
    await renderScreen(<IntegrationsScreen />);

    await fireEvent.press(await screen.findByRole("button", { name: CONNECT.connect }));

    expect(await screen.findByText(CONNECT.connected)).toBeTruthy();
    expect(await screen.findByText("Connected · Last synced never")).toBeTruthy();
    expect(writesMade(server)).toEqual(["GET /integrations/gmail/connect", `POST ${GMAIL_COMPLETE_URL}`]);
    expect(screen.queryByRole("button", { name: CONNECT.connect })).toBeNull();
  });

  it("reconnects it when the sign-in expired", async () => {
    const server = startIntegrationsServer({ integrations: [aGmail({ needs_reauth: true })] });
    signInConnects(server);
    await renderScreen(<IntegrationsScreen />);

    await fireEvent.press(await screen.findByRole("button", { name: CONNECT.reconnect }));

    expect(await screen.findByText("Connected · Last synced never")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.needsReauth)).toBeNull();
  });

  it("keeps the button and gives the reason when Google's answer is a refusal", async () => {
    startIntegrationsServer({ integrations: [] });
    openBrowser.mockResolvedValue({ type: "success", url: `${GMAIL_CONNECT_RETURN_URL}?result=error&reason=denied` });
    await renderScreen(<IntegrationsScreen />);

    await fireEvent.press(await screen.findByRole("button", { name: CONNECT.connect }));

    expect(await screen.findByText(GMAIL_CONNECT_FAILURE_MESSAGES.denied)).toBeTruthy();
    expect(screen.getByText(MESSAGES.notConnected)).toBeTruthy();
    expect(screen.getByRole("button", { name: CONNECT.connect })).toBeTruthy();
  });

  it.each([[[]], [[aGmail({ needs_reauth: true })]]])("offers a viewer no Connect or Reconnect", async (integrations) => {
    startIntegrationsServer({ role: "viewer", integrations });
    await renderScreen(<IntegrationsScreen />);

    expect(await screen.findByText(MESSAGES.viewOnly)).toBeTruthy();
    expect(screen.queryByRole("button", { name: CONNECT.connect })).toBeNull();
    expect(screen.queryByRole("button", { name: CONNECT.reconnect })).toBeNull();
  });
});
