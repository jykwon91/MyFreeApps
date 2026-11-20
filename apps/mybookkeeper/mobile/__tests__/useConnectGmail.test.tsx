import { GMAIL_CONNECT_FAILURE_MESSAGES, GMAIL_CONNECT_FAILURES } from "@mybookkeeper/api-client/constants/gmailConnect";
import type { GmailConnectFailure } from "@mybookkeeper/api-client/types/integration/gmail-connect-failure";
import { integrationsApi } from "@mybookkeeper/api-client/store/integrationsApi";
import api from "@platform/core/lib/api";
import { ToastProvider } from "@platform/mobile";
import { act, renderHook, screen, waitFor } from "@testing-library/react-native";
import { openAuthSessionAsync } from "expo-web-browser";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { GMAIL_CONNECT_MESSAGES as MESSAGES, GMAIL_CONNECT_RETURN_URL } from "../src/constants/gmailConnect";
import { useConnectGmail } from "../src/features/integrations/useConnectGmail";
import { store } from "../src/lib/store";
import { GMAIL_COMPLETE_URL, GOOGLE_ANSWER, GOOGLE_ANSWER_QUERY, GOOGLE_AUTH_URL } from "../test-support/googleAuthUrl";
import { startIntegrationsServer, writesMade } from "../test-support/integrationsServer";
import { resetSignedInStore } from "../test-support/renderScreen";

jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));

const openBrowser = jest.mocked(openAuthSessionAsync);
const originalAdapter = api.defaults.adapter;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{children}</ToastProvider>
    </Provider>
  );
}

async function connect() {
  const { result } = await renderHook(() => useConnectGmail(), { wrapper });
  await act(async () => {
    await result.current.run();
  });
  return result;
}

/** The tags each Gmail-connected refresh asked to reload. */
function invalidations(dispatch: jest.SpyInstance): unknown[] {
  return dispatch.mock.calls
    .map(([action]) => action)
    .filter((action) => integrationsApi.util.invalidateTags.match(action))
    .map((action) => action.payload);
}

const returned = (query: string) => ({ type: "success" as const, url: `${GMAIL_CONNECT_RETURN_URL}#${query}` });

beforeEach(() => {
  resetSignedInStore();
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("useConnectGmail", () => {
  it("asks for a phone sign-in, opens it with the app's return path, finishes it signed in, and refreshes Gmail", async () => {
    const server = startIntegrationsServer({ integrations: [] });
    openBrowser.mockResolvedValue(returned(GOOGLE_ANSWER_QUERY));
    const dispatch = jest.spyOn(store, "dispatch");

    await connect();

    expect(writesMade(server)).toEqual(["GET /integrations/gmail/connect", `POST ${GMAIL_COMPLETE_URL}`]);
    expect(server.requests[0].params).toEqual({ client: "mobile" });
    expect(JSON.parse(String(server.requests[1].data))).toEqual(GOOGLE_ANSWER);
    expect(openBrowser).toHaveBeenCalledWith(GOOGLE_AUTH_URL, "mybookkeeper://oauth-callback");
    expect(invalidations(dispatch)).toEqual([["Integration", { type: "SignedLease", id: "RECEIPTS_PENDING" }]]);
    expect(await screen.findByText(MESSAGES.connected)).toBeTruthy();
  });

  it.each(["cancel", "dismiss"] as const)("says nothing when the browser is closed (%s)", async (type) => {
    startIntegrationsServer({ integrations: [] });
    openBrowser.mockResolvedValue({ type } as Awaited<ReturnType<typeof openAuthSessionAsync>>);
    const dispatch = jest.spyOn(store, "dispatch");

    await connect();

    expect(invalidations(dispatch)).toEqual([]);
    expect(screen.queryByText(MESSAGES.connected)).toBeNull();
    for (const message of Object.values(GMAIL_CONNECT_FAILURE_MESSAGES)) expect(screen.queryByText(message)).toBeNull();
  });

  it.each(GMAIL_CONNECT_FAILURES.map((reason) => [reason]))("gives the reason when the server says %s", async (reason: GmailConnectFailure) => {
    const server = startIntegrationsServer({ integrations: [] });
    openBrowser.mockResolvedValue(returned(`result=error&reason=${reason}`));
    const dispatch = jest.spyOn(store, "dispatch");

    await connect();

    expect(await screen.findByText(GMAIL_CONNECT_FAILURE_MESSAGES[reason])).toBeTruthy();
    expect(invalidations(dispatch)).toEqual([]);
    expect(writesMade(server)).toEqual(["GET /integrations/gmail/connect"]);
  });

  it.each(GMAIL_CONNECT_FAILURES.map((reason) => [reason]))("gives the reason when the server won't finish it: %s", async (reason: GmailConnectFailure) => {
    startIntegrationsServer({ integrations: [], failures: { complete: { status: 403, detail: reason } } });
    openBrowser.mockResolvedValue(returned(GOOGLE_ANSWER_QUERY));
    const dispatch = jest.spyOn(store, "dispatch");

    await connect();

    expect(await screen.findByText(GMAIL_CONNECT_FAILURE_MESSAGES[reason])).toBeTruthy();
    expect(screen.queryByText(MESSAGES.connected)).toBeNull();
    expect(invalidations(dispatch)).toEqual([]);
  });

  it("says it couldn't connect when the server can't be reached to finish it", async () => {
    startIntegrationsServer({ integrations: [], failures: { complete: "offline" } });
    openBrowser.mockResolvedValue(returned(GOOGLE_ANSWER_QUERY));

    await connect();

    expect(await screen.findByText(GMAIL_CONNECT_FAILURE_MESSAGES.failed)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.connected)).toBeNull();
  });

  it.each([
    ["a reason it doesn't know", returned("result=error&reason=<script>")],
    ["an answer it doesn't know", returned("result=maybe")],
    ["the server saying it's connected without the app finishing it", returned("result=connected")],
    ["another address", { type: "success" as const, url: `https://evil.example/oauth-callback#${GOOGLE_ANSWER_QUERY}` }],
    ["the answer in the query instead of the fragment", { type: "success" as const, url: `${GMAIL_CONNECT_RETURN_URL}?${GOOGLE_ANSWER_QUERY}` }],
  ])("treats %s as a plain failure, never as connected", async (_name, answer) => {
    const server = startIntegrationsServer({ integrations: [] });
    openBrowser.mockResolvedValue(answer);

    await connect();

    expect(writesMade(server)).toEqual(["GET /integrations/gmail/connect"]);

    expect(await screen.findByText(GMAIL_CONNECT_FAILURE_MESSAGES.failed)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.connected)).toBeNull();
  });

  it("doesn't open the browser when the server won't start it", async () => {
    startIntegrationsServer({ integrations: [], failures: { connect: { status: 403 } } });

    await connect();

    expect(openBrowser).not.toHaveBeenCalled();
    expect(await screen.findByText("You have view-only access, so I can't do that.")).toBeTruthy();
  });

  it("says it couldn't reach the server when offline", async () => {
    startIntegrationsServer({ integrations: [], failures: { connect: "offline" } });

    await connect();

    expect(openBrowser).not.toHaveBeenCalled();
    expect(await screen.findByText(MESSAGES.couldntReach)).toBeTruthy();
  });

  it("says so when the browser can't open", async () => {
    startIntegrationsServer({ integrations: [] });
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    openBrowser.mockRejectedValue(new Error("Another web browser is already open"));

    await connect();

    expect(await screen.findByText(MESSAGES.couldntOpen)).toBeTruthy();
  });

  it("stays busy while the browser is open, and ignores a second tap", async () => {
    const server = startIntegrationsServer({ integrations: [] });
    let close: (value: Awaited<ReturnType<typeof openAuthSessionAsync>>) => void = () => undefined;
    openBrowser.mockReturnValue(new Promise((resolve) => (close = resolve)));
    const { result } = await renderHook(() => useConnectGmail(), { wrapper });

    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.run();
    });
    await waitFor(() => expect(openBrowser).toHaveBeenCalled());
    expect(result.current.isBusy).toBe(true);
    await act(async () => {
      await result.current.run();
    });
    expect(writesMade(server)).toEqual(["GET /integrations/gmail/connect"]);

    await act(async () => {
      close({ type: "cancel" } as Awaited<ReturnType<typeof openAuthSessionAsync>>);
      await first;
    });
    expect(result.current.isBusy).toBe(false);
  });
});
