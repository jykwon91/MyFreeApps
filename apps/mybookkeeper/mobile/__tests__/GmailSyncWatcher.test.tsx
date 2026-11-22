import { SYNC_ACTIVE_POLL_INTERVAL_MS, SYNC_IDLE_POLL_INTERVAL_MS } from "@mybookkeeper/api-client/constants/syncPolling";
import { documentsApi } from "@mybookkeeper/api-client/store/documentsApi";
import api from "@platform/core/lib/api";
import { refetchOnForeground } from "@platform/mobile";
import { act, cleanup, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import GmailSyncWatcher from "../src/features/integrations/GmailSyncWatcher";
import { store } from "../src/lib/store";
import { aQueueItem, startIntegrationsServer } from "../test-support/integrationsServer";
import { renderScreen, resetSignedInStore } from "../test-support/renderScreen";

// Long enough for an answer to arrive and the store to pass it on, well short of a poll.
const SETTLE_MS = 100;
const originalAdapter = api.defaults.adapter;
let appStateListeners: ((state: string) => void)[] = [];
let stopWatchingDocuments: (() => void) | undefined;
let stopForegroundListener: (() => void) | undefined;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  resetSignedInStore();
  appStateListeners = [];
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListeners.push(listener as (state: string) => void);
    return { remove: jest.fn() };
  });
  // The store's own listener was added before this test could hear it, so the same one is added again here.
  stopForegroundListener = refetchOnForeground(store.dispatch);
});

afterEach(async () => {
  await cleanup();
  stopWatchingDocuments?.();
  stopWatchingDocuments = undefined;
  stopForegroundListener?.();
  // Run out this test's clock before the next one replaces it, or the store stops telling components about new data.
  jest.runAllTimers();
  jest.useRealTimers();
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function setAppState(state: string) {
  await act(async () => {
    appStateListeners.forEach((listener) => listener(state));
  });
}

/**
 * Waits for the queue's answer to reach the watcher. The rate it polls at is only known from what
 * it has read, and the store tells components about new data on a timer of its own.
 */
async function queueRead(server: { queueReads: number }, reads: number) {
  await waitFor(() => expect(server.queueReads).toBe(reads));
  await waitFor(() => expect(store.getState().api.queries["getEmailQueue(undefined)"]?.status).toBe("fulfilled"));
  await advance(SETTLE_MS);
}

/** Something on another screen built from extracted documents, to see whether it reloads. */
async function watchDocuments(server: { documentReads: number }) {
  await act(async () => {
    const subscription = store.dispatch(documentsApi.endpoints.getDocuments.initiate({ status: "processing" }));
    stopWatchingDocuments = () => subscription.unsubscribe();
  });
  await waitFor(() => expect(server.documentReads).toBe(1));
}

describe("watching Gmail extraction from anywhere in the app", () => {
  it("re-reads the queue while emails are being read, and reloads documents when they finish", async () => {
    const server = startIntegrationsServer({ queue: [aQueueItem({ status: "extracting" })] });
    await renderScreen(<GmailSyncWatcher />);
    await queueRead(server, 1);
    await watchDocuments(server);

    await advance(SYNC_ACTIVE_POLL_INTERVAL_MS);
    await queueRead(server, 2);
    expect(server.documentReads).toBe(1);

    server.queue = [aQueueItem({ status: "done" })];
    await advance(SYNC_ACTIVE_POLL_INTERVAL_MS);
    await waitFor(() => expect(server.documentReads).toBe(2));
  });

  it("stops once nothing is in flight", async () => {
    const server = startIntegrationsServer({ queue: [aQueueItem({ status: "extracting" })] });
    await renderScreen(<GmailSyncWatcher />);
    await queueRead(server, 1);

    server.queue = [aQueueItem({ status: "done" })];
    await advance(SYNC_ACTIVE_POLL_INTERVAL_MS);
    await queueRead(server, 2);

    await advance(SYNC_IDLE_POLL_INTERVAL_MS * 2);
    expect(server.queueReads).toBe(2);
  });

  it("doesn't poll an idle queue at all", async () => {
    const server = startIntegrationsServer({ queue: [aQueueItem({ status: "done" })] });
    await renderScreen(<GmailSyncWatcher />);
    await queueRead(server, 1);

    await advance(SYNC_IDLE_POLL_INTERVAL_MS * 2);
    expect(server.queueReads).toBe(1);
  });

  it("stops in the background, and catches up on what finished when the app comes back", async () => {
    const server = startIntegrationsServer({ queue: [aQueueItem({ status: "extracting" })] });
    await renderScreen(<GmailSyncWatcher />);
    await queueRead(server, 1);
    await watchDocuments(server);

    await setAppState("background");
    server.queue = [aQueueItem({ status: "done" })];
    await advance(SYNC_ACTIVE_POLL_INTERVAL_MS * 3);
    expect(server.queueReads).toBe(1);
    expect(server.documentReads).toBe(1);

    await setAppState("active");
    await waitFor(() => expect(server.documentReads).toBe(2));
  });

  it("reads nothing with no Gmail linked", async () => {
    const server = startIntegrationsServer({ integrations: [], queue: [aQueueItem({ status: "extracting" })] });
    await renderScreen(<GmailSyncWatcher />);
    await advance(SYNC_ACTIVE_POLL_INTERVAL_MS * 3);
    expect(server.queueReads).toBe(0);
  });
});
