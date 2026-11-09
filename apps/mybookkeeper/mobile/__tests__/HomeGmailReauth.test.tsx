import api from "@platform/core/lib/api";
import { fireEvent, screen } from "@testing-library/react-native";
import { GMAIL_REAUTH_WAITING } from "../src/constants/home";
import { answerRequest, renderHome, resetHome } from "../test-support/homeScreen";
import { aGmail } from "../test-support/integrationsServer";
import { aTransaction, startTransactionServer } from "../test-support/transactionsServer";

const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({
  router: { navigate: (path: string) => mockNavigate(path), push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
}));

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  resetHome();
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("Home: Gmail needs you to sign in again", () => {
  it("waits for a writer, isn't 'all caught up', and opens Integrations", async () => {
    startTransactionServer([aTransaction()]);
    answerRequest("/integrations", [aGmail({ needs_reauth: true })]);
    await renderHome();
    await fireEvent.press(await screen.findByRole("button", { name: GMAIL_REAUTH_WAITING }));
    expect(mockNavigate).toHaveBeenLastCalledWith("/integrations");
    expect(screen.queryByText("You're all caught up.")).toBeNull();
  });

  it("says nothing while Gmail is working", async () => {
    startTransactionServer([aTransaction()]);
    answerRequest("/integrations", [aGmail()]);
    await renderHome();
    expect(await screen.findByText("You're all caught up.")).toBeTruthy();
    expect(screen.queryByText(GMAIL_REAUTH_WAITING)).toBeNull();
  });

  it("says nothing when Gmail was never connected", async () => {
    startTransactionServer([aTransaction()]);
    answerRequest("/integrations", []);
    await renderHome();
    expect(await screen.findByText("You're all caught up.")).toBeTruthy();
  });

  it("doesn't ask a viewer, who can't reconnect it", async () => {
    const server = startTransactionServer([aTransaction()]);
    server.role = "viewer";
    answerRequest("/integrations", [aGmail({ needs_reauth: true })]);
    await renderHome();
    expect(await screen.findByText("You're all caught up.")).toBeTruthy();
    expect(screen.queryByText(GMAIL_REAUTH_WAITING)).toBeNull();
    expect(server.requests.some((request) => request.url === "/integrations")).toBe(false);
  });
});
