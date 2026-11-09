import api from "@platform/core/lib/api";
import { act, screen } from "@testing-library/react-native";
import { Alert } from "react-native";
import { SYNC_ACTIVE_POLL_INTERVAL_MS, SYNC_IDLE_POLL_INTERVAL_MS } from "@mybookkeeper/api-client/constants/syncPolling";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../src/constants/integrations";
import IntegrationsScreen from "../src/features/integrations/IntegrationsScreen";
import { aGmail, aQueueItem, aSyncLog, startIntegrationsServer } from "../test-support/integrationsServer";
import { renderScreen, resetSignedInStore } from "../test-support/renderScreen";

let mockBlur: (() => void) | undefined;
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => {
      mockBlur = callback();
    }, [callback]);
  },
  router: { push: jest.fn(), back: jest.fn() },
}));

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  resetSignedInStore();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe("keeping the sync history fresh", () => {
  it("re-reads it every few seconds while a sync runs and the screen is showing, and stops when it isn't", async () => {
    const server = startIntegrationsServer({ logs: [aSyncLog({ id: 1, status: "running", completed_at: null })] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findAllByText(/Syncing/);

    server.logs = [aSyncLog({ id: 1 })];
    await advance(SYNC_ACTIVE_POLL_INTERVAL_MS);
    await screen.findByText("3 documents added");

    server.logs = [aSyncLog({ id: 2, status: "running", completed_at: null }), aSyncLog({ id: 1 })];
    await advance(SYNC_IDLE_POLL_INTERVAL_MS);
    await screen.findAllByText(/Syncing/);

    await act(async () => {
      mockBlur?.();
    });
    server.logs = [aSyncLog({ id: 2, records_added: 9 }), aSyncLog({ id: 1 })];
    await advance(SYNC_ACTIVE_POLL_INTERVAL_MS * 3);
    expect(screen.queryByText("9 documents added")).toBeNull();
  });

  it("slows right down when nothing is running", async () => {
    const server = startIntegrationsServer({ logs: [aSyncLog({ id: 1 })], queue: [aQueueItem({ status: "done" })] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText("3 documents added");

    server.logs = [aSyncLog({ id: 1, records_added: 9 })];
    await advance(SYNC_ACTIVE_POLL_INTERVAL_MS * 3);
    expect(screen.queryByText("9 documents added")).toBeNull();
    await advance(SYNC_IDLE_POLL_INTERVAL_MS);
    await screen.findByText("9 documents added");
  });

  it("keeps reading quickly while emails are waiting to be read, even with no sync running", async () => {
    const server = startIntegrationsServer({ logs: [aSyncLog({ id: 1 })], queue: [aQueueItem({ status: "extracting" })] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText("3 documents added");

    server.logs = [aSyncLog({ id: 1, records_added: 9 })];
    await advance(SYNC_ACTIVE_POLL_INTERVAL_MS);
    await screen.findByText("9 documents added");
  });

  it("re-reads Gmail's own status when a sync finishes, so an expired sign-in shows", async () => {
    const server = startIntegrationsServer({ logs: [aSyncLog({ id: 1, status: "running", completed_at: null })] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findAllByText(/Syncing/);

    server.integrations = [aGmail({ needs_reauth: true })];
    server.logs = [aSyncLog({ id: 1, status: "failed", error: "Token expired" })];
    await advance(SYNC_ACTIVE_POLL_INTERVAL_MS);
    await screen.findByText(MESSAGES.needsReauth);
  });
});
