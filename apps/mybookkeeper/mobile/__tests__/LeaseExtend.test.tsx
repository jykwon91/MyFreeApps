import type { LeaseExtensionSummary } from "@mybookkeeper/api-client/types/lease/lease-extension-summary";
import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";
import type { SignedLeaseStatus } from "@mybookkeeper/api-client/types/lease/signed-lease-status";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Alert, type AlertButton, Platform } from "react-native";
import { Provider } from "react-redux";
import { aLease } from "../test-support/aLease";
import LeaseDetailScreen from "../src/features/leases/LeaseDetailScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-local-authentication", () => ({ SecurityLevel: { NONE: 0 }, authenticateAsync: jest.fn(), getEnrolledLevelAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

const originalAdapter = api.defaults.adapter;

interface FakeServer {
  lease: SignedLeaseDetail;
  role: string;
  writeFailure: { status: number; detail?: unknown } | "offline" | null;
  /** The server does the work, then the answer is lost. */
  commitsThenFails: boolean;
  readsFail: boolean;
  writes: AxiosRequestConfig[];
  workspaceReads: number;
  tenantHasEmail: boolean | null;
}

function anExtension(overrides: Partial<LeaseExtensionSummary> = {}): LeaseExtensionSummary {
  return {
    id: "x1",
    created_at: "2026-10-20T12:00:00Z",
    starts_on: "2026-03-01",
    ends_on: "2027-08-31",
    source_attachment_id: "f1",
    previous_ends_on: "2027-02-28",
    undo_expires_at: "2026-11-19T12:00:00Z",
    can_undo: true,
    ...overrides,
  };
}

function startServer(lease: SignedLeaseDetail = aLease()): FakeServer {
  const server: FakeServer = { lease, role: "owner", writeFailure: null, commitsThenFails: false, readsFail: false, writes: [], workspaceReads: 0, tenantHasEmail: true };
  const adapter: AxiosAdapter = async (config) => {
    const respond = (data: unknown, status = 200) => {
      const response = { data, status, statusText: "", headers: {}, config };
      if (status < 300) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error("failed"), { isAxiosError: true, config, response }));
    };
    const offline = () => Promise.reject(Object.assign(new Error("Network Error"), { config }));
    if (config.url === "/organizations") {
      server.workspaceReads += 1;
      return respond([{ id: "w1", name: "Mine", org_role: server.role }]);
    }
    if (config.url === "/applicants/a1") {
      return server.tenantHasEmail === null ? offline() : respond({ id: "a1", has_contact_email: server.tenantHasEmail });
    }
    if (config.method !== "post") return server.readsFail ? offline() : respond(server.lease);

    server.writes.push(config);
    if (server.writeFailure === "offline") return offline();
    if (server.writeFailure) return respond({ detail: server.writeFailure.detail ?? "nope" }, server.writeFailure.status);
    if (config.url === "/signed-leases/l1/extend") {
      const { new_ends_on: endsOn } = JSON.parse(String(config.data)) as { new_ends_on: string };
      server.lease = { ...server.lease, ends_on: endsOn, latest_extension: anExtension({ ends_on: endsOn }) };
    } else {
      server.lease = { ...server.lease, ends_on: server.lease.latest_extension?.previous_ends_on ?? null, latest_extension: null };
    }
    return server.commitsThenFails ? respond({ detail: "boom" }, 500) : respond(server.lease);
  };
  api.defaults.adapter = adapter;
  return server;
}

async function renderScreen() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <LeaseDetailScreen id="l1" />
      </ToastProvider>
    </Provider>,
  );
  await screen.findByText("Term");
}

const EXTEND = { name: "Extend lease" };
const UNDO = { name: "Undo extension" };

async function openSheet() {
  await fireEvent.press(await screen.findByRole("button", EXTEND));
  await screen.findByTestId("date-picker");
}

async function pickDate(year: number, month: number, day: number) {
  await act(async () => screen.getByTestId("date-picker").props.onChange({ type: "set" }, new Date(year, month - 1, day)));
}

/** The sheet's button, which comes after the page's own in the tree. */
function submitButton() {
  return screen.getAllByRole("button", EXTEND).at(-1)!;
}

function alertButtons(): AlertButton[] {
  return jest.mocked(Alert.alert).mock.calls[0]?.[2] ?? [];
}

async function pressUndoAndConfirm() {
  await fireEvent.press(await screen.findByRole("button", UNDO));
  await act(async () => alertButtons()[1].onPress?.());
}

describe("extending a lease", () => {
  beforeEach(() => {
    session.tokenStore.set("token");
    store.dispatch(baseApi.util.resetApiState());
    store.dispatch(workspaceChosen("w1"));
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    jest.restoreAllMocks();
  });

  describe("who sees it", () => {
    it.each(["signed", "active"] as const)("offers it on a %s lease", async (status) => {
      startServer(aLease({ status }));
      await renderScreen();
      expect(await screen.findByRole("button", EXTEND)).toBeTruthy();
    });

    it.each(["draft", "generated", "sent", "ended", "terminated"] as SignedLeaseStatus[])("doesn't offer it on a %s lease", async (status) => {
      startServer(aLease({ status, latest_extension: anExtension() }));
      await renderScreen();
      await screen.findByRole("button", { name: "Manage on the website" });
      expect(screen.queryByRole("button", EXTEND)).toBeNull();
      expect(screen.queryByRole("button", UNDO)).toBeNull();
    });

    it("doesn't offer it without an end date to extend from", async () => {
      startServer(aLease({ ends_on: null }));
      await renderScreen();
      await screen.findByRole("button", { name: "Manage on the website" });
      expect(screen.queryByRole("button", EXTEND)).toBeNull();
    });

    it("doesn't offer either with view-only access", async () => {
      const server = startServer(aLease({ latest_extension: anExtension() }));
      server.role = "viewer";
      await renderScreen();
      await waitFor(() => expect(server.workspaceReads).toBeGreaterThan(0));
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(screen.queryByRole("button", EXTEND)).toBeNull();
      expect(screen.queryByRole("button", UNDO)).toBeNull();
    });
  });

  describe("the sheet", () => {
    it("won't let the calendar go before the current end date", async () => {
      startServer();
      await renderScreen();
      await openSheet();
      const { minimumDate, value } = screen.getByTestId("date-picker").props as { minimumDate: Date; value: Date };
      expect(minimumDate).toEqual(new Date(2027, 1, 28));
      expect(value).toEqual(new Date(2027, 1, 28));
    });

    it("gives Android's date dialog the same limit", async () => {
      const original = Platform.OS;
      Platform.OS = "android";
      try {
        startServer();
        await renderScreen();
        await fireEvent.press(await screen.findByRole("button", EXTEND));
        await fireEvent.press(await screen.findByRole("button", { name: /^New end date: .* Change date$/ }));
        expect(jest.mocked(DateTimePickerAndroid.open).mock.calls[0][0].minimumDate).toEqual(new Date(2027, 1, 28));
      } finally {
        Platform.OS = original;
      }
    });

    it("waits for a date rather than assuming one", async () => {
      const server = startServer();
      await renderScreen();
      await openSheet();
      expect(submitButton()).toBeDisabled();
      await fireEvent.press(submitButton());
      expect(server.writes).toHaveLength(0);
    });

    it("refuses a date that isn't later and says why", async () => {
      startServer();
      await renderScreen();
      await openSheet();
      await pickDate(2027, 2, 28);
      expect(screen.getByText("Pick a date after February 28, 2027.")).toBeTruthy();
      expect(submitButton()).toBeDisabled();
    });

    it("extends with the date and trimmed note, and emails nobody unless asked", async () => {
      const server = startServer();
      await renderScreen();
      await openSheet();
      await pickDate(2027, 8, 31);
      await fireEvent.changeText(screen.getByLabelText("Note (optional)"), "  Six more months  ");
      await fireEvent.press(submitButton());
      expect(await screen.findByText("Lease extended to August 31, 2027.")).toBeTruthy();
      expect(JSON.parse(String(server.writes[0].data))).toEqual({ new_ends_on: "2027-08-31", notes: "Six more months", email_tenant: false });
      await waitFor(() => expect(screen.queryByTestId("date-picker")).toBeNull());
      expect(screen.getByText(/March 1, 2026 to August 31, 2027/)).toBeTruthy();
    });

    it("leaves the note out when it's only spaces", async () => {
      const server = startServer();
      await renderScreen();
      await openSheet();
      await pickDate(2027, 8, 31);
      await fireEvent.changeText(screen.getByLabelText("Note (optional)"), "   ");
      await fireEvent.press(submitButton());
      await screen.findByText("Lease extended to August 31, 2027.");
      expect(JSON.parse(String(server.writes[0].data)).notes).toBeUndefined();
    });

    it("closes straight away when nothing's been entered", async () => {
      startServer();
      await renderScreen();
      await openSheet();
      await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(screen.queryByTestId("date-picker")).toBeNull();
    });

    it("asks before throwing away a date", async () => {
      startServer();
      await renderScreen();
      await openSheet();
      await pickDate(2027, 8, 31);
      await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
      expect(Alert.alert).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("date-picker")).toBeTruthy();
      await act(async () => alertButtons()[1].onPress?.());
      expect(screen.queryByTestId("date-picker")).toBeNull();
    });
  });

  describe("emailing the tenant", () => {
    const SWITCH = "Email Dana Reed the addendum";

    async function pickDateAndSwitchOn() {
      await pickDate(2027, 8, 31);
      await fireEvent(await screen.findByLabelText(SWITCH), "valueChange", true);
    }

    it("asks first, then sends it and says so", async () => {
      const server = startServer();
      await renderScreen();
      await openSheet();
      await pickDateAndSwitchOn();
      await fireEvent.press(submitButton());
      expect(server.writes).toHaveLength(0);
      expect(jest.mocked(Alert.alert).mock.calls[0][0]).toBe("Extend and email Dana Reed?");
      expect(jest.mocked(Alert.alert).mock.calls[0][1]).toContain("August 31, 2027");
      await act(async () => alertButtons()[1].onPress?.());
      expect(await screen.findByText("Lease extended to August 31, 2027. I'll email the addendum shortly.")).toBeTruthy();
      expect(JSON.parse(String(server.writes[0].data)).email_tenant).toBe(true);
    });

    it("sends nothing when the question is cancelled, and can be asked again", async () => {
      const server = startServer();
      await renderScreen();
      await openSheet();
      await pickDateAndSwitchOn();
      await fireEvent.press(submitButton());
      await act(async () => alertButtons()[0].onPress?.());
      expect(server.writes).toHaveLength(0);
      await fireEvent.press(submitButton());
      expect(jest.mocked(Alert.alert)).toHaveBeenCalledTimes(2);
    });

    it("explains when there's no address, with no switch", async () => {
      const server = startServer();
      server.tenantHasEmail = false;
      await renderScreen();
      await openSheet();
      expect(await screen.findByText("This tenant has no email on file, so I can't email them the addendum.")).toBeTruthy();
      expect(screen.queryByLabelText(SWITCH)).toBeNull();
    });

    it("offers neither when it can't tell", async () => {
      const server = startServer();
      server.tenantHasEmail = null;
      await renderScreen();
      await openSheet();
      await waitFor(() => expect(screen.queryByLabelText(SWITCH)).toBeNull());
      expect(screen.queryByText(/no email on file/)).toBeNull();
    });

    it("says nothing changed when the address has gone since the sheet opened", async () => {
      const server = startServer();
      await renderScreen();
      await openSheet();
      await pickDateAndSwitchOn();
      server.writeFailure = { status: 422, detail: "applicant_email_missing" };
      server.tenantHasEmail = false;
      await fireEvent.press(submitButton());
      await act(async () => alertButtons()[1].onPress?.());
      expect(await screen.findByText("This tenant has no email on file. Nothing was changed.")).toBeTruthy();
      await waitFor(() => expect(screen.queryByLabelText(SWITCH)).toBeNull());
    });

    it("doesn't claim the email went out when only the extension can be confirmed", async () => {
      const server = startServer();
      server.commitsThenFails = true;
      await renderScreen();
      await openSheet();
      await pickDateAndSwitchOn();
      await fireEvent.press(submitButton());
      await act(async () => alertButtons()[1].onPress?.());
      expect(await screen.findByText("Lease extended to August 31, 2027. I can't tell if the email went out.")).toBeTruthy();
    });
  });

  describe("when it fails", () => {
    it.each([
      [{ status: 403 }, "You have view-only access."],
      [{ status: 404 }, "That lease is gone."],
      [{ status: 409, detail: { code: "INVALID_STATUS_FOR_EXTENSION", message: "dev words" } }, "This lease is no longer signed or active, so it can't be extended."],
      [{ status: 409, detail: { code: "MISSING_CURRENT_END_DATE", message: "dev words" } }, "This lease has no end date yet. Add the original term on the website, then extend."],
      [{ status: 422 }, "Check the date and note, then try again."],
    ])("keeps what you entered and says why on %j", async (failure, message) => {
      const server = startServer();
      await renderScreen();
      await openSheet();
      await pickDate(2027, 8, 31);
      await fireEvent.changeText(screen.getByLabelText("Note (optional)"), "Six more months");
      server.writeFailure = failure;
      await fireEvent.press(submitButton());
      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.getByLabelText("Note (optional)").props.value).toBe("Six more months");
      expect(screen.queryByText(/dev words/)).toBeNull();
    });

    it("counts it as done when the server saved it but the answer was an error", async () => {
      const server = startServer();
      await renderScreen();
      await openSheet();
      await pickDate(2027, 8, 31);
      server.commitsThenFails = true;
      await fireEvent.press(submitButton());
      expect(await screen.findByText("Lease extended to August 31, 2027.")).toBeTruthy();
      await waitFor(() => expect(screen.queryByTestId("date-picker")).toBeNull());
    });

    it("says nothing changed when it checks and nothing did", async () => {
      const server = startServer();
      await renderScreen();
      await openSheet();
      await pickDate(2027, 8, 31);
      server.writeFailure = { status: 500 };
      await fireEvent.press(submitButton());
      expect(await screen.findByText("That didn't go through. Nothing was changed.")).toBeTruthy();
      expect(screen.getByTestId("date-picker")).toBeTruthy();
    });

    it("doesn't say nothing changed when there was no answer, because it could still be saving", async () => {
      const server = startServer();
      await renderScreen();
      await openSheet();
      await pickDate(2027, 8, 31);
      server.writeFailure = "offline";
      await fireEvent.press(submitButton());
      expect(await screen.findByText("I don't see that change on the lease yet. Trying the same date again is safe.")).toBeTruthy();
    });

    it("says it can't tell when it can't check, and the same date is then safe", async () => {
      const server = startServer();
      await renderScreen();
      await openSheet();
      await pickDate(2027, 8, 31);
      server.writeFailure = "offline";
      server.readsFail = true;
      await fireEvent.press(submitButton());
      expect(await screen.findByText("I can't reach the server, so I can't tell if that went through. Trying the same date again is safe.")).toBeTruthy();

      // It had gone through after all, so the server refuses the repeat.
      server.readsFail = false;
      server.lease = { ...server.lease, ends_on: "2027-08-31" };
      server.writeFailure = { status: 409, detail: { code: "NEW_END_DATE_NOT_AFTER_CURRENT", message: "dev words" } };
      await fireEvent.press(submitButton());
      expect(await screen.findByText("Lease extended to August 31, 2027.")).toBeTruthy();
    });

    it("shows the new date when someone else already extended it further", async () => {
      const server = startServer();
      await renderScreen();
      await openSheet();
      await pickDate(2027, 8, 31);
      server.lease = { ...server.lease, ends_on: "2027-12-31" };
      server.writeFailure = { status: 409, detail: { code: "NEW_END_DATE_NOT_AFTER_CURRENT", message: "dev words" } };
      await fireEvent.press(submitButton());
      expect(await screen.findByText("The lease already ends December 31, 2027. It may have been changed elsewhere. Pick a later date.")).toBeTruthy();
    });

    it("can't fire twice", async () => {
      const server = startServer();
      await renderScreen();
      await openSheet();
      await pickDate(2027, 8, 31);
      await fireEvent.press(submitButton());
      await fireEvent.press(submitButton());
      await screen.findByText("Lease extended to August 31, 2027.");
      expect(server.writes).toHaveLength(1);
    });
  });

  describe("undoing", () => {
    const extended = () => aLease({ ends_on: "2027-08-31", latest_extension: anExtension() });

    it("offers it with its deadline when the server says it can", async () => {
      startServer(extended());
      await renderScreen();
      expect(await screen.findByRole("button", UNDO)).toBeTruthy();
      expect(screen.getByText("You can undo this until November 19, 2026.")).toBeTruthy();
    });

    it("goes by the server, not the phone's clock", async () => {
      startServer(aLease({ latest_extension: anExtension({ can_undo: false, created_at: "2099-01-01T00:00:00Z" }) }));
      await renderScreen();
      await screen.findByRole("button", EXTEND);
      expect(screen.queryByRole("button", UNDO)).toBeNull();
      expect(screen.getByText(/^Extended to/)).toBeTruthy();
    });

    it("asks first, naming both dates and saying the file stays", async () => {
      const server = startServer(extended());
      await renderScreen();
      await fireEvent.press(await screen.findByRole("button", UNDO));
      const [title, body] = jest.mocked(Alert.alert).mock.calls[0];
      expect(title).toBe("Undo this extension?");
      expect(body).toContain("from August 31, 2027 to February 28, 2027");
      expect(body).toContain("stays attached");
      expect(alertButtons()[0]).toMatchObject({ text: "Not now", style: "cancel" });
      await act(async () => alertButtons()[0].onPress?.());
      expect(server.writes).toHaveLength(0);
    });

    it("rolls back and shows the old date", async () => {
      const server = startServer(extended());
      await renderScreen();
      await pressUndoAndConfirm();
      expect(await screen.findByText("Extension undone. The lease ends February 28, 2027 again.")).toBeTruthy();
      expect(server.writes[0].url).toBe("/signed-leases/l1/extensions/x1/undo");
      await waitFor(() => expect(screen.queryByRole("button", UNDO)).toBeNull());
    });

    it.each([
      [{ status: 403 }, "You have view-only access."],
      [{ status: 404 }, "That extension was already undone."],
      [{ status: 409, detail: { code: "UNDO_WINDOW_EXPIRED", message: "dev words" } }, "This extension is more than 30 days old, so it can't be undone any more."],
      [{ status: 409, detail: { code: "NOT_LATEST_EXTENSION", message: "dev words" } }, "A newer extension was added. Open the lease again to undo the latest one."],
      [{ status: 500 }, "I couldn't undo the extension. Want to try again?"],
    ])("says why on %j", async (failure, message) => {
      const server = startServer(extended());
      await renderScreen();
      server.writeFailure = failure;
      await pressUndoAndConfirm();
      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.queryByText(/dev words/)).toBeNull();
    });

    it("counts it as done when the server saved it but the answer was an error", async () => {
      const server = startServer(extended());
      await renderScreen();
      server.commitsThenFails = true;
      await pressUndoAndConfirm();
      expect(await screen.findByText("Extension undone. The lease ends February 28, 2027 again.")).toBeTruthy();
    });

    it("doesn't take a different extension for its own undo", async () => {
      const server = startServer(extended());
      await renderScreen();
      await fireEvent.press(await screen.findByRole("button", UNDO));
      server.writeFailure = { status: 500 };
      server.lease = { ...server.lease, ends_on: "2028-01-31", latest_extension: anExtension({ id: "x2", ends_on: "2028-01-31" }) };
      await act(async () => alertButtons()[1].onPress?.());
      expect(await screen.findByText("I couldn't undo the extension. Want to try again?")).toBeTruthy();
      expect(screen.queryByText(/^Extension undone/)).toBeNull();
    });

    it("doesn't claim success when it can't check", async () => {
      const server = startServer(extended());
      await renderScreen();
      server.writeFailure = "offline";
      server.readsFail = true;
      await pressUndoAndConfirm();
      expect(await screen.findByText("I couldn't undo the extension. Want to try again?")).toBeTruthy();
    });
  });
});
