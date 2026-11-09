import api from "@platform/core/lib/api";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";
import { EMAIL_QUEUE_STATUS_LABELS, INTEGRATIONS_MESSAGES as MESSAGES } from "../src/constants/integrations";
import SyncSessionScreen from "../src/features/integrations/SyncSessionScreen";
import { aQueueItem, aSyncLog, startIntegrationsServer, writesMade } from "../test-support/integrationsServer";
import { renderScreen, resetSignedInStore } from "../test-support/renderScreen";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: jest.fn(), back: () => mockBack() },
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

async function confirm() {
  const buttons: AlertButton[] = jest.mocked(Alert.alert).mock.calls[0]?.[2] ?? [];
  await act(async () => buttons[1].onPress?.());
}

describe("SyncSessionScreen: loading and failing", () => {
  it("shows a skeleton while the history is on its way", async () => {
    startIntegrationsServer({ failures: { logs: "hold" } });
    await renderScreen(<SyncSessionScreen id={1} />);
    expect(await screen.findByTestId("sync-session-skeleton")).toBeTruthy();
  });

  it("offers a retry when the history could not load, and recovers", async () => {
    const server = startIntegrationsServer({ logs: [aSyncLog()], failures: { logs: { status: 500 } } });
    await renderScreen(<SyncSessionScreen id={1} />);
    await screen.findByText(MESSAGES.sessionCouldntLoad);
    server.failures = {};
    await fireEvent.press(button(MESSAGES.tryAgain));
    await screen.findByText("3 documents added");
  });

  it("says when the sync is not there, and goes back", async () => {
    startIntegrationsServer({ logs: [aSyncLog({ id: 2 })] });
    await renderScreen(<SyncSessionScreen id={1} />);
    await screen.findByText(MESSAGES.sessionCantFind);
    await fireEvent.press(button(MESSAGES.back));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe("SyncSessionScreen: the sync", () => {
  it("shows the status, times, funnel and documents added", async () => {
    startIntegrationsServer({ logs: [aSyncLog({ gmail_matches_total: 10, emails_total: 4, emails_fetched: 4, emails_done: 3, records_added: 3 })] });
    await renderScreen(<SyncSessionScreen id={1} />);
    await screen.findByText("3 documents added");
    for (const label of [MESSAGES.started, MESSAGES.completed, MESSAGES.gmailMatches, MESSAGES.newAfterDedup, MESSAGES.fetchedFromGmail, MESSAGES.extractedByClaude, MESSAGES.documentsAdded]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("10")).toBeTruthy();
  });

  it("shows the older funnel for a sync that predates the dedup counts", async () => {
    startIntegrationsServer({ logs: [aSyncLog({ gmail_matches_total: 0, emails_total: 5, emails_fetched: 5, emails_done: 5 })] });
    await renderScreen(<SyncSessionScreen id={1} />);
    await screen.findByText(MESSAGES.emailsFound);
    expect(screen.queryByText(MESSAGES.gmailMatches)).toBeNull();
  });

  it("shows no funnel when no emails were found, and no completed time while running", async () => {
    startIntegrationsServer({ logs: [aSyncLog({ status: "running", completed_at: null, records_added: null })] });
    await renderScreen(<SyncSessionScreen id={1} />);
    await screen.findByText(MESSAGES.documentsAdded);
    expect(screen.queryByText(MESSAGES.completed)).toBeNull();
    expect(screen.queryByText(MESSAGES.gmailMatches)).toBeNull();
    expect(screen.queryByText(MESSAGES.emailsFound)).toBeNull();
  });

  it("shows the error text of a failed sync", async () => {
    startIntegrationsServer({ logs: [aSyncLog({ status: "failed", error: "Gmail said no" })] });
    await renderScreen(<SyncSessionScreen id={1} />);
    await screen.findByText("Gmail said no");
    expect(screen.getByText("Failed")).toBeTruthy();
  });

  it("shows progress for a running sync and cancels it", async () => {
    const server = startIntegrationsServer({ logs: [aSyncLog({ id: 5, status: "running", completed_at: null, emails_total: 10, emails_done: 4 })] });
    await renderScreen(<SyncSessionScreen id={5} />);
    await screen.findByText("4 / 10");
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.cancelThisSync }));
    await screen.findByText(MESSAGES.cancelled);
    expect(writesMade(server)).toEqual(["POST /integrations/gmail/sync/cancel"]);
    expect(JSON.parse(server.requests[0].data as string)).toEqual({ sync_log_id: 5 });
  });

  it("says when cancelling failed", async () => {
    startIntegrationsServer({ logs: [aSyncLog({ status: "running", completed_at: null })], failures: { write: { status: 500 } } });
    await renderScreen(<SyncSessionScreen id={1} />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.cancelThisSync }));
    await screen.findByText(/couldn't cancel the sync/);
  });

  it("gives a viewer no cancel button", async () => {
    startIntegrationsServer({ role: "viewer", logs: [aSyncLog({ status: "running", completed_at: null })] });
    await renderScreen(<SyncSessionScreen id={1} />);
    await screen.findByText(MESSAGES.documentsAdded);
    expect(screen.queryByRole("button", { name: MESSAGES.cancelThisSync })).toBeNull();
  });
});

describe("SyncSessionScreen: the emails", () => {
  it("lists only this sync's emails with their status and why one failed", async () => {
    startIntegrationsServer({
      logs: [aSyncLog()],
      queue: [
        aQueueItem({ id: "a", attachment_filename: "invoice.pdf", email_subject: "Your invoice" }),
        aQueueItem({ id: "b", attachment_filename: null, email_subject: "Statement", status: "failed", error: "Could not read" }),
        aQueueItem({ id: "c", sync_log_id: 2, attachment_filename: "other.pdf" }),
      ],
    });
    await renderScreen(<SyncSessionScreen id={1} />);
    await screen.findByText("invoice.pdf");
    expect(screen.getByText("Your invoice")).toBeTruthy();
    expect(screen.getByText(MESSAGES.emailBody)).toBeTruthy();
    expect(screen.getByText("Could not read")).toBeTruthy();
    expect(screen.getByText(EMAIL_QUEUE_STATUS_LABELS.failed)).toBeTruthy();
    expect(screen.queryByText("other.pdf")).toBeNull();
  });

  it("says no emails were queued only when the queue loaded without any", async () => {
    startIntegrationsServer({ logs: [aSyncLog()] });
    await renderScreen(<SyncSessionScreen id={1} />);
    await screen.findByText(MESSAGES.itemsNone);
  });

  it("doesn't claim none were queued when the sync says it queued some that left the recent queue", async () => {
    startIntegrationsServer({ logs: [aSyncLog({ emails_total: 3, gmail_matches_total: 3 })], queue: [aQueueItem({ id: "x", sync_log_id: 2 })] });
    await renderScreen(<SyncSessionScreen id={1} />);
    await screen.findByText(MESSAGES.itemsGone(3));
    expect(screen.queryByText(MESSAGES.itemsNone)).toBeNull();
  });

  it("says how many are still in the recent queue when only some are", async () => {
    startIntegrationsServer({ logs: [aSyncLog({ emails_total: 3, gmail_matches_total: 3 })], queue: [aQueueItem({ id: "a" })] });
    await renderScreen(<SyncSessionScreen id={1} />);
    await screen.findByText("invoice.pdf");
    expect(screen.getByText(MESSAGES.itemsPartial(1, 3))).toBeTruthy();
  });

  it("says nothing has been queued yet, not that none were, while a sync is still running", async () => {
    startIntegrationsServer({ logs: [aSyncLog({ status: "running", completed_at: null })] });
    await renderScreen(<SyncSessionScreen id={1} />);
    await screen.findByText(MESSAGES.itemsNoneYet);
    expect(screen.queryByText(MESSAGES.itemsNone)).toBeNull();
  });

  it("offers a retry, and not 'none', when the queue could not load", async () => {
    const server = startIntegrationsServer({ logs: [aSyncLog()], failures: { queue: { status: 500 } } });
    await renderScreen(<SyncSessionScreen id={1} />);
    await screen.findByText(MESSAGES.itemsCouldntLoad);
    expect(screen.queryByText(MESSAGES.itemsNone)).toBeNull();
    server.failures = {};
    server.queue = [aQueueItem()];
    await fireEvent.press(button(MESSAGES.tryAgain));
    await screen.findByText("invoice.pdf");
  });

  it("retries a failed email", async () => {
    const server = startIntegrationsServer({ logs: [aSyncLog()], queue: [aQueueItem({ status: "failed", error: "bad" })] });
    await renderScreen(<SyncSessionScreen id={1} />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.retry }));
    await screen.findByText(MESSAGES.itemRetried);
    expect(writesMade(server)).toEqual(["POST /integrations/gmail/queue/q1/retry"]);
  });

  it("says when a retry failed", async () => {
    startIntegrationsServer({ logs: [aSyncLog()], queue: [aQueueItem({ status: "failed" })], failures: { write: { status: 500 } } });
    await renderScreen(<SyncSessionScreen id={1} />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.retry }));
    await screen.findByText(/couldn't retry that email/);
  });

  it("asks before dismissing an email, then dismisses it", async () => {
    const server = startIntegrationsServer({ logs: [aSyncLog()], queue: [aQueueItem()] });
    await renderScreen(<SyncSessionScreen id={1} />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.dismiss }));
    expect(writesMade(server)).toEqual([]);
    await confirm();
    await screen.findByText(MESSAGES.dismissed);
    expect(writesMade(server)).toEqual(["DELETE /integrations/gmail/queue/q1"]);
    // The list reloads without it.
    await waitFor(() => expect(screen.queryByText("invoice.pdf")).toBeNull());
    await screen.findByText(MESSAGES.itemsNone);
  });

  it("words the question by what dismissing does to that email", async () => {
    startIntegrationsServer({
      logs: [aSyncLog()],
      queue: [
        aQueueItem({ id: "a", attachment_filename: "reading.pdf", status: "extracting" }),
        aQueueItem({ id: "b", attachment_filename: "broken.pdf", status: "failed", error: "bad" }),
        aQueueItem({ id: "c", attachment_filename: "waiting.pdf", status: "fetched" }),
      ],
    });
    await renderScreen(<SyncSessionScreen id={1} />);
    await screen.findByText("reading.pdf");
    const asked: string[][] = [];
    for (const index of [0, 1, 2]) {
      await fireEvent.press((await screen.findAllByRole("button", { name: MESSAGES.dismiss }))[index]);
      const call = jest.mocked(Alert.alert).mock.calls.at(-1);
      asked.push([String(call?.[0]), String(call?.[1])]);
      await act(async () => call?.[2]?.[0].onPress?.());
    }
    expect(asked[0]).toEqual([MESSAGES.dismissConfirmTitle("reading.pdf"), expect.stringMatching(/mark it as failed and leave it in the queue/)]);
    expect(asked[1]).toEqual([MESSAGES.dismissConfirmTitle("broken.pdf"), expect.stringMatching(/already tried to read it.*remove it from the queue/)]);
    expect(asked[2]).toEqual([MESSAGES.dismissConfirmTitle("waiting.pdf"), expect.stringMatching(/remove it from the queue without reading it/)]);
  });

  it("says when dismissing failed", async () => {
    startIntegrationsServer({ logs: [aSyncLog()], queue: [aQueueItem()], failures: { write: { status: 500 } } });
    await renderScreen(<SyncSessionScreen id={1} />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.dismiss }));
    await confirm();
    await screen.findByText(/couldn't dismiss that email/);
  });

  it("offers nothing on a finished email, and retry only on a failed one", async () => {
    startIntegrationsServer({ logs: [aSyncLog()], queue: [aQueueItem({ id: "a", status: "done" }), aQueueItem({ id: "b", status: "fetched" })] });
    await renderScreen(<SyncSessionScreen id={1} />);
    await screen.findByText(EMAIL_QUEUE_STATUS_LABELS.done);
    expect(await screen.findAllByRole("button", { name: MESSAGES.dismiss })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: MESSAGES.retry })).toBeNull();
  });

  it("gives a viewer no retry or dismiss", async () => {
    startIntegrationsServer({ role: "viewer", logs: [aSyncLog()], queue: [aQueueItem({ status: "failed" })] });
    await renderScreen(<SyncSessionScreen id={1} />);
    await screen.findByText("invoice.pdf");
    expect(screen.queryByRole("button", { name: MESSAGES.retry })).toBeNull();
    expect(screen.queryByRole("button", { name: MESSAGES.dismiss })).toBeNull();
  });
});
