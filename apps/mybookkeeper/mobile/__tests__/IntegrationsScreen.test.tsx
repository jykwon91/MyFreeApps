import api from "@platform/core/lib/api";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { Alert } from "react-native";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../src/constants/integrations";
import { SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import IntegrationsScreen from "../src/features/integrations/IntegrationsScreen";
import { aGmail, aQueueItem, aSyncLog, startIntegrationsServer } from "../test-support/integrationsServer";
import { renderScreen, resetSignedInStore } from "../test-support/renderScreen";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), back: jest.fn() },
}));

const originalAdapter = api.defaults.adapter;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

beforeEach(() => {
  resetSignedInStore();
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("IntegrationsScreen: loading and failing", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startIntegrationsServer({ failures: { integrations: "hold" } });
    await renderScreen(<IntegrationsScreen />);
    expect(await screen.findByTestId("integrations-skeleton")).toBeTruthy();
  });

  it("says it couldn't load, never that Gmail is not connected, and recovers on Try again", async () => {
    const server = startIntegrationsServer({ failures: { integrations: { status: 500 } } });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText(MESSAGES.couldntLoad);
    expect(screen.queryByText(MESSAGES.notConnected)).toBeNull();
    server.failures = {};
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    await screen.findByText(new RegExp(MESSAGES.connected));
  });

  it("keeps what it had and says so when a pull to refresh fails", async () => {
    const server = startIntegrationsServer({ logs: [aSyncLog()] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText("3 documents added");
    server.failures = { integrations: { status: 500 } };
    await act(async () => {
      await screen.getByTestId("integrations-list").props.refreshControl.props.onRefresh();
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("3 documents added")).toBeTruthy();
  });
});

describe("IntegrationsScreen: a failed refresh of one part", () => {
  const pull = () =>
    act(async () => {
      await screen.getByTestId("integrations-list").props.refreshControl.props.onRefresh();
    });

  it("says the sync history may be out of date when only it fails to reload", async () => {
    const server = startIntegrationsServer({ logs: [aSyncLog()] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText("3 documents added");
    server.failures = { logs: { status: 500 } };
    await pull();
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("3 documents added")).toBeTruthy();
  });

  it("says the queue summary may be out of date when only it fails to reload", async () => {
    const server = startIntegrationsServer({ queue: [aQueueItem({ status: "done" })] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText(MESSAGES.queueAllDone(1));
    server.failures = { queue: { status: 500 } };
    await pull();
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText(MESSAGES.queueAllDone(1))).toBeTruthy();
  });
});

describe("IntegrationsScreen: Gmail status", () => {
  it("says honestly that Gmail is not connected, and points to the website, with no sync or history", async () => {
    const server = startIntegrationsServer({ integrations: [], logs: [aSyncLog()] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText(MESSAGES.notConnected);
    expect(screen.getByText(MESSAGES.notConnectedBody)).toBeTruthy();
    expect(screen.getByRole("link", { name: MESSAGES.openOnWeb })).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.syncNow })).toBeNull();
    expect(screen.queryByText(MESSAGES.historyHeading)).toBeNull();
    expect(server.requests).toEqual([]);
  });

  it("asks to reconnect on the website when the sign-in expired, and offers no sync", async () => {
    startIntegrationsServer({ integrations: [aGmail({ needs_reauth: true })], logs: [aSyncLog()] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText(MESSAGES.needsReauth);
    expect(screen.getByText(MESSAGES.needsReauthBody)).toBeTruthy();
    expect(screen.getByRole("link", { name: MESSAGES.openOnWeb })).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.syncNow })).toBeNull();
    expect(screen.queryByRole("button", { name: MESSAGES.disconnect })).toBeNull();
    expect(screen.queryByText(new RegExp(`^${MESSAGES.connected}`))).toBeNull();
    expect(screen.getByRole("button", { name: MESSAGES.labelEdit })).toBeTruthy();
  });

  it("shows when it last synced, and says never when it hasn't", async () => {
    startIntegrationsServer({ integrations: [aGmail({ last_synced_at: hoursAgo(2) })] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText("Connected · Last synced 2 hours ago");
  });

  it("says never when it has not synced yet", async () => {
    startIntegrationsServer();
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText("Connected · Last synced never");
  });

  it("shows the label filter, or that every email is synced", async () => {
    startIntegrationsServer({ integrations: [aGmail({ gmail_label: "Receipts" })] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText(MESSAGES.labelCurrently("Receipts"));
  });

  it("says all emails are synced when there is no label", async () => {
    startIntegrationsServer();
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText(MESSAGES.labelNone);
  });

  it("shows how far a running sync has got", async () => {
    startIntegrationsServer({ logs: [aSyncLog({ id: 4, status: "running", emails_total: 20, emails_fetched: 8, emails_done: 5, completed_at: null })] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText("5 / 20");
    expect(screen.getAllByText("Syncing… 8 of 20 fetched, 5 extracted").length).toBeGreaterThan(0);
  });
});

describe("IntegrationsScreen: sync history", () => {
  it("lists each sync and opens one on its own screen", async () => {
    startIntegrationsServer({
      logs: [aSyncLog({ id: 2, status: "failed", error: "boom" }), aSyncLog({ id: 1 })],
      queue: [aQueueItem({ id: "a", sync_log_id: 1 }), aQueueItem({ id: "b", sync_log_id: 1, status: "done" })],
    });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText("Failed");
    expect(screen.getByText(/Sync #1 · .* · 2 items/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /^Failed\./ }));
    expect(mockPush).toHaveBeenCalledWith("/integrations/sync/2");
  });

  it("says there are no syncs yet only when the history loaded empty", async () => {
    startIntegrationsServer();
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText(MESSAGES.historyNone);
  });

  it("offers a retry, and not 'no syncs', when the history could not load", async () => {
    const server = startIntegrationsServer({ logs: [aSyncLog()], failures: { logs: { status: 500 } } });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText(MESSAGES.historyCouldntLoad);
    expect(screen.queryByText(MESSAGES.historyNone)).toBeNull();
    server.failures = {};
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    await screen.findByText("3 documents added");
  });

  it("shows a skeleton for the history while it loads", async () => {
    startIntegrationsServer({ failures: { logs: "hold" } });
    await renderScreen(<IntegrationsScreen />);
    expect(await screen.findByTestId("sync-history-skeleton")).toBeTruthy();
  });
});

describe("IntegrationsScreen: email queue summary", () => {
  it("counts what is waiting", async () => {
    startIntegrationsServer({
      logs: [aSyncLog()],
      queue: [aQueueItem({ id: "a" }), aQueueItem({ id: "b" }), aQueueItem({ id: "c", status: "extracting" }), aQueueItem({ id: "d", status: "failed" })],
    });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText("2 ready to extract · 1 extracting · 1 failed");
  });

  it("says when everything is processed, and when the queue is empty", async () => {
    startIntegrationsServer({ queue: [aQueueItem({ status: "done" })] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText(MESSAGES.queueAllDone(1));
  });

  it("doesn't say everything is processed while emails are still pending", async () => {
    startIntegrationsServer({ logs: [aSyncLog({ status: "running", completed_at: null })], queue: [aQueueItem({ id: "a", status: "pending" }), aQueueItem({ id: "b", status: "pending" })] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText(MESSAGES.queuePending(2));
    expect(screen.queryByText(MESSAGES.queueAllDone(2))).toBeNull();
  });

  it("says everything is processed only when every email is done or skipped", async () => {
    startIntegrationsServer({ queue: [aQueueItem({ id: "a", status: "done" }), aQueueItem({ id: "b", status: "skipped" })] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText(MESSAGES.queueAllDone(2));
  });

  it("says the queue is empty only when it loaded empty", async () => {
    startIntegrationsServer();
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText(MESSAGES.queueEmpty);
  });

  it("warns, rather than showing counts, when the queue could not load", async () => {
    const server = startIntegrationsServer({ failures: { queue: { status: 500 } } });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText(MESSAGES.queueCouldntLoad);
    expect(screen.queryByText(MESSAGES.queueEmpty)).toBeNull();
    server.failures = {};
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    await screen.findByText(MESSAGES.queueEmpty);
  });
});
