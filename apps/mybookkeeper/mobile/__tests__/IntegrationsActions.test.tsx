import api from "@platform/core/lib/api";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../src/constants/integrations";
import IntegrationsScreen from "../src/features/integrations/IntegrationsScreen";
import { aGmail, aQueueItem, aSyncLog, startIntegrationsServer, writesMade } from "../test-support/integrationsServer";
import { renderScreen, resetSignedInStore } from "../test-support/renderScreen";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: jest.fn(), back: jest.fn() },
}));

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  resetSignedInStore();
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });

function alertButtons(): AlertButton[] {
  return jest.mocked(Alert.alert).mock.calls[0]?.[2] ?? [];
}

async function confirm() {
  await act(async () => alertButtons()[1].onPress?.());
}

async function dismissAlert() {
  await act(async () => alertButtons()[0].onPress?.());
}

describe("sync now", () => {
  it("asks first, then starts the sync and says so", async () => {
    const server = startIntegrationsServer();
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.syncNow }));
    expect(jest.mocked(Alert.alert).mock.calls[0]?.[0]).toBe(MESSAGES.syncConfirmTitle);
    expect(writesMade(server)).toEqual([]);
    await confirm();
    await screen.findByText(MESSAGES.syncStarted);
    expect(writesMade(server)).toEqual(["POST /integrations/gmail/sync"]);
    // The history reloads with the sync that was just started.
    expect((await screen.findAllByText(/Syncing/)).length).toBeGreaterThan(0);
    expect(server.logs).toHaveLength(1);
  });

  it("does nothing when the question is turned down", async () => {
    const server = startIntegrationsServer();
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.syncNow }));
    await dismissAlert();
    expect(writesMade(server)).toEqual([]);
  });

  it("shows busy and ignores another tap while the request is on its way", async () => {
    const server = startIntegrationsServer({ failures: { write: "hold" } });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.syncNow }));
    await confirm();
    await screen.findByRole("button", { name: MESSAGES.syncing });
    expect(button(MESSAGES.syncing).props.accessibilityState?.disabled).toBe(true);
    expect(writesMade(server)).toEqual(["POST /integrations/gmail/sync"]);
  });

  it("says a sync is already running when the server says so", async () => {
    startIntegrationsServer({ failures: { write: { status: 409 } } });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.syncNow }));
    await confirm();
    await screen.findByText(/already in progress/);
  });

  it("explains a missing label", async () => {
    startIntegrationsServer({ failures: { write: { status: 422 } } });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.syncNow }));
    await confirm();
    await screen.findByText(/couldn't find the Gmail label/);
  });

  it("says when the server can't be reached", async () => {
    startIntegrationsServer({ failures: { write: "offline" } });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.syncNow }));
    await confirm();
    await screen.findByText(/can't reach the server/);
  });
});

describe("cancelling a running sync", () => {
  const running = () => aSyncLog({ id: 7, status: "running", emails_total: 4, completed_at: null });

  it("disables Sync now and cancels that sync", async () => {
    const server = startIntegrationsServer({ logs: [running()] });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.cancelSync }));
    await screen.findByText(MESSAGES.cancelled);
    expect(writesMade(server)).toEqual(["POST /integrations/gmail/sync/cancel"]);
    expect(JSON.parse(server.requests[0].data as string)).toEqual({ sync_log_id: 7 });
    // The list reloads: the sync now reads as cancelled, so it can be started again.
    await screen.findByText(/^Cancelled/);
    expect(button(MESSAGES.syncNow).props.accessibilityState?.disabled).toBe(false);
  });

  it("offers no disconnect while the sync is running", async () => {
    startIntegrationsServer({ logs: [running()] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByRole("button", { name: MESSAGES.cancelSync });
    expect(screen.queryByRole("button", { name: MESSAGES.disconnect })).toBeNull();
  });

  it("says when it could not cancel", async () => {
    startIntegrationsServer({ logs: [running()], failures: { write: { status: 500 } } });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.cancelSync }));
    await screen.findByText(/couldn't cancel the sync/);
  });
});

describe("disconnecting", () => {
  it("asks first, then disconnects and says so", async () => {
    const server = startIntegrationsServer();
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.disconnect }));
    expect(jest.mocked(Alert.alert).mock.calls[0]?.[0]).toBe(MESSAGES.disconnectConfirmTitle);
    expect(writesMade(server)).toEqual([]);
    await confirm();
    await screen.findByText(MESSAGES.disconnected);
    expect(writesMade(server)).toEqual(["DELETE /integrations/gmail"]);
    // The list reloads and Gmail is no longer linked.
    await screen.findByText(MESSAGES.notConnected);
  });

  it("says what disconnecting costs the whole workspace before doing it", async () => {
    startIntegrationsServer();
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.disconnect }));
    const body = jest.mocked(Alert.alert).mock.calls[0]?.[1] ?? "";
    expect(body).toMatch(/everyone in the workspace/);
    expect(body).toMatch(/inquiry replies and rent-receipt emails stop sending/i);
    expect(body).toMatch(/on the website/);
    expect(body).toMatch(/label filter is cleared/);
    expect(body).toMatch(/already imported stay/);
    expect(body).not.toMatch(/revoke/i);
  });

  it("can't be tapped while a sync is being started", async () => {
    startIntegrationsServer({ failures: { write: "hold" } });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.syncNow }));
    await confirm();
    await waitFor(() => expect(button(MESSAGES.disconnect).props.accessibilityState?.disabled).toBe(true));
  });

  it("does nothing when the question is turned down", async () => {
    const server = startIntegrationsServer();
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.disconnect }));
    await dismissAlert();
    expect(writesMade(server)).toEqual([]);
  });

  it("says when it could not disconnect", async () => {
    startIntegrationsServer({ failures: { write: { status: 500 } } });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.disconnect }));
    await confirm();
    await screen.findByText(/couldn't disconnect Gmail/);
  });

  it("says a demo account can't, not that the person has view-only access", async () => {
    startIntegrationsServer({ failures: { write: { status: 403, detail: "This feature is not available for demo accounts" } } });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.disconnect }));
    await confirm();
    await screen.findByText(MESSAGES.demoRefused);
    expect(screen.queryByText(/view-only/)).toBeNull();
  });

  it("says view-only access when the server refuses a plain 403", async () => {
    startIntegrationsServer({ failures: { write: { status: 403 } } });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.disconnect }));
    await confirm();
    await screen.findByText(/view-only access/);
  });
});

describe("extracting and retrying", () => {
  const queue = () => [aQueueItem({ id: "a" }), aQueueItem({ id: "b" }), aQueueItem({ id: "c", status: "failed", error: "bad pdf" })];

  it("extracts everything fetched and says how many", async () => {
    const server = startIntegrationsServer({ logs: [aSyncLog()], queue: queue() });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.extractAll(2) }));
    await screen.findByText(MESSAGES.extracting(2));
    expect(writesMade(server)).toEqual(["POST /integrations/gmail/extract"]);
    // The queue reloads: the two fetched emails are being read now.
    await screen.findByRole("button", { name: MESSAGES.extractingCount(2) });
  });

  it("says when extracting could not start", async () => {
    startIntegrationsServer({ queue: queue(), failures: { write: { status: 500 } } });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.extractAll(2) }));
    await screen.findByText(/couldn't start reading those emails/);
  });

  it("shows busy while extraction is running on the server", async () => {
    startIntegrationsServer({ queue: [aQueueItem({ status: "extracting" })] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByRole("button", { name: MESSAGES.extractingCount(1) });
    expect(screen.queryByRole("button", { name: MESSAGES.extractAll(1) })).toBeNull();
  });

  it("retries every failed item", async () => {
    const server = startIntegrationsServer({ queue: queue() });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.retryFailed(1) }));
    await screen.findByText(MESSAGES.retriedAll);
    expect(writesMade(server)).toEqual(["POST /integrations/gmail/queue/retry-all"]);
    await screen.findByRole("button", { name: MESSAGES.extractAll(3) });
    expect(screen.queryByRole("button", { name: MESSAGES.retryFailed(1) })).toBeNull();
  });

  it("says when the retry failed", async () => {
    startIntegrationsServer({ queue: queue(), failures: { write: { status: 500 } } });
    await renderScreen(<IntegrationsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.retryFailed(1) }));
    await screen.findByText(/couldn't retry the failed items/);
  });
});

describe("a viewer", () => {
  it("sees everything but can change nothing", async () => {
    startIntegrationsServer({ role: "viewer", logs: [aSyncLog()], queue: [aQueueItem({ status: "failed" }), aQueueItem({ id: "b" })], integrations: [aGmail({ gmail_label: "Receipts" })] });
    await renderScreen(<IntegrationsScreen />);
    // Gmail, history and queue load as separate requests. Wait for the slowest ones, or the
    // "can change nothing" checks below pass before the queue's buttons could have appeared.
    await screen.findByText("1 ready to extract · 1 failed");
    await screen.findByText("3 documents added");
    expect(screen.getByText(MESSAGES.viewOnly)).toBeTruthy();
    expect(screen.getByText(MESSAGES.labelCurrently("Receipts"))).toBeTruthy();
    for (const name of [MESSAGES.syncNow, MESSAGES.disconnect, MESSAGES.labelEdit, MESSAGES.extractAll(1), MESSAGES.retryFailed(1)]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });
});

describe("the label filter", () => {
  const open = async () => {
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.labelEdit }));
    await screen.findByText(MESSAGES.labelSheetTitle);
  };

  it("saves a label and says what will sync", async () => {
    const server = startIntegrationsServer();
    await renderScreen(<IntegrationsScreen />);
    await open();
    expect(button(MESSAGES.labelSave).props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.labelHeading), "  Receipts ");
    await fireEvent.press(button(MESSAGES.labelSave));
    await screen.findByText(MESSAGES.labelSaved("Receipts"));
    expect(writesMade(server)).toEqual(["PATCH /integrations/gmail/label"]);
    expect(JSON.parse(server.requests[0].data as string)).toEqual({ label: "Receipts" });
    await screen.findByText(MESSAGES.labelCurrently("Receipts"));
    await waitFor(() => expect(screen.queryByText(MESSAGES.labelSheetTitle)).toBeNull());
  });

  it("clears the label by saving it empty", async () => {
    const server = startIntegrationsServer({ integrations: [aGmail({ gmail_label: "Receipts" })] });
    await renderScreen(<IntegrationsScreen />);
    await open();
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.labelHeading), "");
    await fireEvent.press(button(MESSAGES.labelSave));
    await screen.findByText(MESSAGES.labelSaved(""));
    expect(JSON.parse(server.requests[0].data as string)).toEqual({ label: "" });
    await waitFor(() => expect(screen.queryByText(MESSAGES.labelCurrently("Receipts"))).toBeNull());
  });

  it("keeps the sheet open with the reason when saving fails", async () => {
    startIntegrationsServer({ failures: { write: { status: 500 } } });
    await renderScreen(<IntegrationsScreen />);
    await open();
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.labelHeading), "Receipts");
    await fireEvent.press(button(MESSAGES.labelSave));
    await screen.findByText(/couldn't save the label/);
    expect(screen.getByText(MESSAGES.labelSheetTitle)).toBeTruthy();
    expect(screen.getByDisplayValue("Receipts")).toBeTruthy();
  });

  it("asks before throwing away an edit, and closes straight away when nothing changed", async () => {
    startIntegrationsServer();
    await renderScreen(<IntegrationsScreen />);
    await open();
    await fireEvent.press(button(MESSAGES.labelCancel));
    await waitFor(() => expect(screen.queryByText(MESSAGES.labelSheetTitle)).toBeNull());
    expect(Alert.alert).not.toHaveBeenCalled();

    await open();
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.labelHeading), "Receipts");
    await fireEvent.press(button(MESSAGES.labelCancel));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });
});
