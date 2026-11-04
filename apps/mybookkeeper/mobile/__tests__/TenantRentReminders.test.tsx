import type { RentLedgerResponse } from "@mybookkeeper/api-client/types/rent/rent-ledger-response";
import type { RentReminderOverview } from "@mybookkeeper/api-client/types/rent/rent-reminder-overview";
import type { RentReminderPreview } from "@mybookkeeper/api-client/types/rent/rent-reminder-preview";
import type { RentReminderSend } from "@mybookkeeper/api-client/types/rent/rent-reminder-send";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { Alert, Linking } from "react-native";
import { Provider } from "react-redux";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import {
  addEmailFirst,
  emailOnlyWent,
  goesOut,
  LOST_SEND_HOLD_MS,
  neitherWent,
  noEmailWontGo,
  REMINDER_MESSAGES,
  sentBoth,
  sentEmail,
  textOnlyWent,
} from "../src/constants/rentReminders";
import { dueLine, sendMoment, sendOutcome, sendReadiness } from "../src/features/rent/rentReminderDisplay";
import TenantRentReminders from "../src/features/rent/TenantRentReminders";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aRentLedger, aRentSchedule } from "../test-support/aRentLedger";
import { aReminderOverview, aReminderPlan, aReminderPreview, aReminderSend } from "../test-support/aRentReminder";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("expo-local-authentication", () => ({ SecurityLevel: { NONE: 0 }, authenticateAsync: jest.fn(), getEnrolledLevelAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const originalAdapter = api.defaults.adapter;
const SEND_BUTTON = "Send now to Dana";

interface ServerState {
  role: string;
  overview: RentReminderOverview | "offline";
  preview: RentReminderPreview | null | "offline";
  sends: RentReminderSend[] | "offline";
  ledger: RentLedgerResponse;
  /** What send-now answers: rows, an HTTP error status, or a lost connection. */
  sendAnswer: RentReminderSend[] | number | "lost";
  afterSend?: () => void;
  sendBodies: unknown[];
  workspaceReads: number;
}

function startServer(overrides: Partial<ServerState> = {}): ServerState {
  const server: ServerState = {
    role: "owner",
    overview: aReminderOverview(),
    preview: aReminderPreview(),
    sends: [],
    ledger: aRentLedger({ schedules: [aRentSchedule()] }),
    sendAnswer: [aReminderSend(), aReminderSend({ id: "send2", channel: "sms", status: "sent_to_phone" })],
    sendBodies: [],
    workspaceReads: 0,
    ...overrides,
  };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig) => {
    const respond = (data: unknown, status = 200) => {
      if (status >= 400) return Promise.reject(Object.assign(new Error("HTTP"), { config, response: { data: { detail: "no" }, status, statusText: "", headers: {}, config } }));
      return { data, status, statusText: "", headers: {}, config } as never;
    };
    const lost = () => Promise.reject(Object.assign(new Error("Network Error"), { config }));
    const answer = (value: unknown) => (value === "offline" ? lost() : respond(value));
    const url = config.url ?? "";
    if (url === "/organizations") {
      server.workspaceReads += 1;
      return respond([{ id: "w1", name: "Mine", org_role: server.role }]);
    }
    if (url.startsWith("/rent-ledger/")) return respond(server.ledger);
    if (url.endsWith("/send-now")) {
      server.sendBodies.push(JSON.parse(config.data as string));
      const sent = server.sendAnswer;
      server.afterSend?.();
      if (sent === "lost") return lost();
      return typeof sent === "number" ? respond(null, sent) : respond(sent);
    }
    if (url.endsWith("/preview")) return answer(server.preview);
    if (url.endsWith("/sends")) return answer(server.sends);
    return answer(server.overview);
  };
  api.defaults.adapter = adapter;
  return server;
}

async function renderReminders(server: ServerState, { hasEnded = false, name = "Dana Reed" as string | null } = {}) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <TenantRentReminders applicantId="a1" hasEnded={hasEnded} name={name} />
      </ToastProvider>
    </Provider>,
  );
  await waitFor(() => expect(server.workspaceReads).toBeGreaterThan(0));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

/** Presses Send now, then the alert's Send button. */
async function sendAndConfirm() {
  const alert = jest.spyOn(Alert, "alert");
  await fireEvent.press(await screen.findByText(SEND_BUTTON));
  const buttons = alert.mock.calls[0][2] ?? [];
  await act(async () => {
    buttons.find((button) => button.text === REMINDER_MESSAGES.send)?.onPress?.();
  });
}

beforeEach(async () => {
  await session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("what the section shows", () => {
  it("shows the plan, the next reminder, how it goes and the history", async () => {
    await renderReminders(startServer({ sends: [aReminderSend({ due_date: "2030-10-27" })] }));

    expect(await screen.findByText("$300.00 due Sun, Nov 3")).toBeTruthy();
    expect(screen.getByText("Weekly, due every Sunday · reminded the day before at 6:00 PM")).toBeTruthy();
    expect(screen.getByText("Goes out Sat, Nov 2 at 6:00 PM")).toBeTruthy();
    expect(screen.getByText("Hi Dana, rent of $300 is due tomorrow (Sunday).")).toBeTruthy();
    expect(screen.getByText("Goes by email and text.")).toBeTruthy();
    expect(screen.getByText(REMINDER_MESSAGES.dontCheckPaid)).toBeTruthy();
    expect(await screen.findByText("Email · $300.00 due Sun, Oct 27")).toBeTruthy();
    expect(screen.getByText("Sent")).toBeTruthy();
  });

  it("asks for a rent schedule when there's no plan and no schedule", async () => {
    await renderReminders(startServer({ overview: aReminderOverview({ plan: null }), ledger: aRentLedger({ schedules: [] }) }));

    expect(await screen.findByText(REMINDER_MESSAGES.needsSchedule)).toBeTruthy();
    expect(screen.getByText(REMINDER_MESSAGES.setUpOnWebsite)).toBeTruthy();
  });

  it("offers to turn reminders on from the website when there's no plan", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
    await renderReminders(startServer({ overview: aReminderOverview({ plan: null }) }));

    await fireEvent.press(await screen.findByText(REMINDER_MESSAGES.turnOnOnWebsite));
    await waitFor(() => expect(open).toHaveBeenCalledWith(expect.stringContaining("/applicants/a1")));
  });

  it("says when a paused plan can't send, and offers no Send", async () => {
    await renderReminders(startServer({ overview: aReminderOverview({ plan: aReminderPlan({ is_active: false }) }) }));

    expect(await screen.findByText(REMINDER_MESSAGES.nextWhenBack)).toBeTruthy();
    expect(screen.getByText(REMINDER_MESSAGES.pausedNote)).toBeTruthy();
    expect(screen.getByText(REMINDER_MESSAGES.pausedCantSend)).toBeTruthy();
    expect(screen.queryByText(SEND_BUTTON)).toBeNull();
    expect(screen.queryByText("Goes out Sat, Nov 2 at 6:00 PM")).toBeNull();
  });

  it("says when nothing is due", async () => {
    await renderReminders(startServer({ preview: null }));

    expect(await screen.findByText(REMINDER_MESSAGES.nothingDue)).toBeTruthy();
    expect(screen.queryByText(SEND_BUTTON)).toBeNull();
  });

  it("says a reminder already went, and can't go again", async () => {
    await renderReminders(startServer({ preview: aReminderPreview({ sent_channels: ["email", "sms"] }) }));

    expect(await screen.findByText("Sent for Sun, Nov 3 · Email, Text")).toBeTruthy();
    expect(screen.getByText(REMINDER_MESSAGES.cantSendAgain)).toBeTruthy();
    expect(screen.queryByText(SEND_BUTTON)).toBeNull();
  });

  it("hides Send when the tenancy has ended", async () => {
    await renderReminders(startServer(), { hasEnded: true });

    expect(await screen.findByText(REMINDER_MESSAGES.tenancyEnded)).toBeTruthy();
    await screen.findByText("$300.00 due Sun, Nov 3");
    expect(screen.queryByText(SEND_BUTTON)).toBeNull();
  });

  it("gives viewers no buttons", async () => {
    await renderReminders(startServer({ role: "viewer" }));

    await screen.findByText("$300.00 due Sun, Nov 3");
    expect(screen.queryByText(SEND_BUTTON)).toBeNull();
    expect(screen.queryByText(REMINDER_MESSAGES.openWebsite)).toBeNull();
  });

  it("offers Try again when the section can't load", async () => {
    const server = startServer({ overview: "offline" });
    await renderReminders(server);

    expect(await screen.findByText(REMINDER_MESSAGES.couldntLoad)).toBeTruthy();
    server.overview = aReminderOverview();
    await fireEvent.press(screen.getByText(REMINDER_MESSAGES.tryAgain));
    expect(await screen.findByText("$300.00 due Sun, Nov 3")).toBeTruthy();
  });

  it("keeps the plan when only the next reminder or the history can't load", async () => {
    await renderReminders(startServer({ preview: "offline", sends: "offline" }));

    expect(await screen.findByText(REMINDER_MESSAGES.couldntLoadNext)).toBeTruthy();
    expect(await screen.findByText(REMINDER_MESSAGES.couldntLoadHistory)).toBeTruthy();
    expect(screen.getByText("Weekly, due every Sunday · reminded the day before at 6:00 PM")).toBeTruthy();
  });

  it("disables Send on what was last loaded once the server can't be reached", async () => {
    const server = startServer();
    await renderReminders(server);
    await screen.findByText(SEND_BUTTON);

    server.overview = "offline";
    await act(async () => {
      store.dispatch(baseApi.util.invalidateTags([{ type: "RentReminder" as never, id: "a1" }]));
    });

    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: SEND_BUTTON, disabled: true })).toBeTruthy());
  });

  it("shortens the history until asked for all of it", async () => {
    const sends = ["1", "2", "3", "4"].map((id) => aReminderSend({ id, due_date: `2030-10-0${id}` }));
    await renderReminders(startServer({ sends }));

    await fireEvent.press(await screen.findByText("Show all 4 reminders"));
    expect(await screen.findByText("Email · $300.00 due Fri, Oct 4")).toBeTruthy();
    await fireEvent.press(screen.getByText(REMINDER_MESSAGES.showFewer));
    expect(screen.queryByText("Email · $300.00 due Fri, Oct 4")).toBeNull();
  });

  it("gives a failed send its reason, not its code", async () => {
    await renderReminders(startServer({ sends: [aReminderSend({ status: "failed", error_code: "weird_code" })] }));

    expect(await screen.findByText("Something went wrong sending it")).toBeTruthy();
    expect(screen.queryByText(/weird_code/)).toBeNull();
  });
});

describe("Send now", () => {
  it("asks first, showing the exact words, and sends only after a yes", async () => {
    const server = startServer();
    const alert = jest.spyOn(Alert, "alert");
    await renderReminders(server);

    await fireEvent.press(await screen.findByText(SEND_BUTTON));

    expect(alert.mock.calls[0][0]).toBe("Send this reminder to Dana Reed?");
    expect(alert.mock.calls[0][1]).toContain("Hi Dana, rent of $300 is due on Sunday, Nov 3.");
    expect(alert.mock.calls[0][1]).toContain(REMINDER_MESSAGES.confirmWarning);
    expect(server.sendBodies).toHaveLength(0);
  });

  it("sends back exactly what it showed", async () => {
    const server = startServer();
    await renderReminders(server);

    await sendAndConfirm();

    await waitFor(() =>
      expect(server.sendBodies).toEqual([{ due_date: "2030-11-03", amount: "300.00", message: "Hi Dana, rent of $300 is due on Sunday, Nov 3.", channels: ["email", "sms"] }]),
    );
    expect(await screen.findByText(sentBoth())).toBeTruthy();
  });

  it("leaves a lasting note when one channel fails", async () => {
    const server = startServer({ sendAnswer: [aReminderSend(), aReminderSend({ id: "send2", channel: "sms", status: "failed", error_code: "invalid_phone" })] });
    await renderReminders(server);

    await sendAndConfirm();

    const message = emailOnlyWent("The phone number couldn't be read", "Dana Reed");
    await waitFor(() => expect(screen.getAllByText(message).length).toBeGreaterThan(0));
  });

  it("keeps that note after the reminder reloads as already sent", async () => {
    const server = startServer({ sendAnswer: [aReminderSend(), aReminderSend({ id: "send2", channel: "sms", status: "failed", error_code: "invalid_phone" })] });
    server.afterSend = () => {
      server.preview = aReminderPreview({ sent_channels: ["email"] });
    };
    await renderReminders(server);

    await sendAndConfirm();

    expect(await screen.findByText(REMINDER_MESSAGES.cantSendAgain)).toBeTruthy();
    expect(screen.queryByText(SEND_BUTTON)).toBeNull();
    expect(screen.getAllByText(emailOnlyWent("The phone number couldn't be read", "Dana Reed")).length).toBeGreaterThan(0);
  });

  it("won't offer Send again for a due date that went out, even if the reload says otherwise", async () => {
    await renderReminders(startServer());

    await sendAndConfirm();

    await screen.findByText(sentBoth());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(screen.getByRole("button", { name: SEND_BUTTON, disabled: true })).toBeTruthy();
  });

  it("lets a send that failed on every channel be tried again", async () => {
    const failed = aReminderSend({ status: "failed", error_code: "email_send_failed" });
    await renderReminders(startServer({ sendAnswer: [failed, { ...failed, id: "send2", channel: "sms" }] }));

    await sendAndConfirm();

    await waitFor(() => expect(screen.getAllByText(neitherWent("The mail server refused it")).length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByRole("button", { name: SEND_BUTTON, disabled: false })).toBeTruthy());
  });

  it.each([
    [412, REMINDER_MESSAGES.changed],
    [409, REMINDER_MESSAGES.alreadyWent],
    [429, REMINDER_MESSAGES.tooMany],
    [404, REMINDER_MESSAGES.gone],
    [422, REMINDER_MESSAGES.cantGoOut],
  ])("explains a %i refusal", async (status, message) => {
    await renderReminders(startServer({ sendAnswer: status }));

    await sendAndConfirm();

    expect(await screen.findByText(message)).toBeTruthy();
  });

  it("reloads the reminder when it changed", async () => {
    const server = startServer({ sendAnswer: 412 });
    server.afterSend = () => {
      server.preview = aReminderPreview({ amount: "350.00" });
    };
    await renderReminders(server);

    await sendAndConfirm();

    expect(await screen.findByText("$350.00 due Sun, Nov 3")).toBeTruthy();
  });

  it("finds a send that lost its answer in the history", async () => {
    const server = startServer({ sendAnswer: "lost" });
    server.afterSend = () => {
      server.sends = [aReminderSend()];
    };
    await renderReminders(server);

    await sendAndConfirm();

    expect(await screen.findByText(REMINDER_MESSAGES.lostButSent)).toBeTruthy();
  });

  it("treats a server error like a lost answer, since it may have sent", async () => {
    await renderReminders(startServer({ sendAnswer: 500 }));

    await sendAndConfirm();

    expect(await screen.findByText(REMINDER_MESSAGES.lostUnknown)).toBeTruthy();
  });

  it("holds Send for a while when it can't tell, then lets go", async () => {
    await renderReminders(startServer({ sendAnswer: "lost" }));
    await screen.findByText(SEND_BUTTON);
    const realSetTimeout = globalThis.setTimeout;
    const delays: number[] = [];
    let release: () => void = () => undefined;
    jest.spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, delay?: number) => {
      delays.push(delay ?? 0);
      if (delay === LOST_SEND_HOLD_MS) {
        release = callback;
        return 0 as never;
      }
      return realSetTimeout(callback, delay);
    }) as never);

    await sendAndConfirm();

    expect(await screen.findByText(REMINDER_MESSAGES.lostUnknown)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: SEND_BUTTON, disabled: true })).toBeTruthy());
    expect(delays).toContain(LOST_SEND_HOLD_MS);
    await act(async () => release());
    await waitFor(() => expect(screen.getByRole("button", { name: SEND_BUTTON, disabled: false })).toBeTruthy());
  });

  it("says so when it can't reach the server to check", async () => {
    const server = startServer({ sendAnswer: "lost" });
    server.afterSend = () => {
      server.sends = "offline";
    };
    await renderReminders(server);

    await sendAndConfirm();

    expect(await screen.findByText(REMINDER_MESSAGES.unreachable)).toBeTruthy();
  });
});

describe("reminder wording", () => {
  const plan = aReminderPlan();

  it("reads the send time as the server wrote it", () => {
    expect(sendMoment("2030-11-02T18:00:00-05:00", new Date("2030-01-01T00:00:00Z"))).toBe(goesOut("Sat, Nov 2 at 6:00 PM"));
  });

  it("says sending soon once the time has passed", () => {
    expect(sendMoment("2030-11-02T18:00:00-05:00", new Date("2031-01-01T00:00:00Z"))).toBe(REMINDER_MESSAGES.sendingSoon);
  });

  it("formats the amount and due date", () => {
    expect(dueLine(aReminderPreview())).toBe("$300.00 due Sun, Nov 3");
  });

  it("warns when one of two channels has nobody to reach", () => {
    expect(sendReadiness(aReminderOverview({ tenant_has_email: false }), plan, "Dana")).toEqual({ canSend: true, notes: [noEmailWontGo("Dana")] });
  });

  it("refuses when no channel can reach them", () => {
    const emailOnly = aReminderPlan({ sms_enabled: false });
    expect(sendReadiness(aReminderOverview({ tenant_has_email: false }), emailOnly, "Dana")).toEqual({ canSend: false, notes: [addEmailFirst("Dana")] });
  });

  it("refuses when texts aren't set up, as the server would", () => {
    const overview = aReminderOverview({ sms: { available: false, from_number: null, encrypted: false, webhook_url: "" } });
    expect(sendReadiness(overview, plan, "Dana")).toEqual({ canSend: false, notes: [REMINDER_MESSAGES.noSms] });
  });

  it("describes each way a send can come out", () => {
    const email = aReminderSend();
    const text = aReminderSend({ id: "s2", channel: "sms", status: "sent_to_phone" });
    const failed = { status: "failed" as const, error_code: "email_send_failed" };
    const reason = "The mail server refused it";

    expect(sendOutcome([email], "Dana")).toEqual({ message: sentEmail("Dana"), isProblem: false });
    expect(sendOutcome([text], "Dana")).toEqual({ message: REMINDER_MESSAGES.textWithPhone, isProblem: false });
    expect(sendOutcome([email, text], "Dana")).toEqual({ message: sentBoth(), isProblem: false });
    expect(sendOutcome([{ ...email, ...failed }, text], "Dana")).toEqual({ message: textOnlyWent(reason), isProblem: true });
    expect(sendOutcome([{ ...email, ...failed }, { ...text, ...failed }], "Dana")).toEqual({ message: neitherWent(reason), isProblem: true });
  });
});
