import { LEASE_ATTACHMENT_KINDS } from "@mybookkeeper/api-client/types/lease/lease-attachment-kind";
import type { SignedLeaseAttachment } from "@mybookkeeper/api-client/types/lease/signed-lease-attachment";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { Alert, type AlertButton } from "react-native";
import { Provider } from "react-redux";
import LeaseDetailScreen from "../src/features/leases/LeaseDetailScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aLease } from "../test-support/aLease";
import { holdWrites } from "../test-support/holdWrites";
import { lastRequest, roleKnown, startLeaseWritesServer } from "../test-support/leaseWritesServer";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() } }));
jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-local-authentication", () => ({ SecurityLevel: { NONE: 0 }, authenticateAsync: jest.fn(), getEnrolledLevelAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;
const alert = jest.spyOn(Alert, "alert");

function aFile(overrides: Partial<SignedLeaseAttachment> = {}): SignedLeaseAttachment {
  return {
    id: "f1",
    lease_id: "l1",
    filename: "signed.pdf",
    storage_key: "k",
    content_type: "application/pdf",
    size_bytes: 10,
    kind: "signed_lease",
    uploaded_by_user_id: "u1",
    uploaded_at: "2026-02-01T12:00:00Z",
    presigned_url: "https://files.example/first",
    is_available: true,
    ...overrides,
  };
}

const NOTICE = aFile({ id: "f2", filename: "notice.pdf", kind: "notice", uploaded_at: "2026-02-02T12:00:00Z" });

async function renderScreen() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <LeaseDetailScreen id="l1" />
      </ToastProvider>
    </Provider>,
  );
}

function pressInAlert(text: string): void {
  const buttons = alert.mock.calls.at(-1)?.[2] as AlertButton[];
  buttons.find((button) => button.text === text)?.onPress?.();
}

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
  alert.mockReset();
  alert.mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("what the lease page says about the lease", () => {
  it("says whether it was imported or made from templates, and when it was made and signed", async () => {
    startLeaseWritesServer({ lease: aLease({ kind: "generated", generated_at: "2026-02-03T12:00:00Z", signed_at: "2026-02-10T12:00:00Z", values: { rent: "1500", pets: "none" } }) });
    await renderScreen();
    expect(await screen.findByText("Made from templates")).toBeTruthy();
    expect(screen.getByText("Made February 3, 2026 · Signed February 10, 2026")).toBeTruthy();
  });

  it("opens every filled-in value on its own screen", async () => {
    startLeaseWritesServer({ lease: aLease({ values: { rent: "1500", pets: "none" } }) });
    await renderScreen();
    expect(await screen.findByText("2 values")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "See what's filled in" }));
    expect(router.push).toHaveBeenCalledWith("/leases/l1/details");
  });

  it("says so when no values are filled in, with nothing to open", async () => {
    startLeaseWritesServer();
    await renderScreen();
    expect(await screen.findByText("No values are filled in on this lease.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "See what's filled in" })).toBeNull();
  });

  it("starts adding a document from an existing template", async () => {
    startLeaseWritesServer();
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Add a document" }));
    expect(router.push).toHaveBeenCalledWith("/leases/l1/add-document");
  });

  it("shows rent receipts with the other files instead of hiding them", async () => {
    startLeaseWritesServer({ lease: aLease({ attachments: [aFile({ id: "r1", filename: "receipt.pdf", kind: "rent_receipt" })] }) });
    await renderScreen();
    expect(await screen.findByRole("button", { name: "Open receipt.pdf" })).toBeTruthy();
    expect(screen.getByText(/^Rent receipt, /)).toBeTruthy();
  });
});

describe("changing what a file is", () => {
  it("offers every kind the website does, and sends the one picked", async () => {
    const server = startLeaseWritesServer({ lease: aLease({ attachments: [aFile(), NOTICE] }) });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Change the type of notice.pdf" }));
    expect(screen.getAllByRole("radio")).toHaveLength(LEASE_ATTACHMENT_KINDS.length);
    await fireEvent.press(screen.getByRole("radio", { name: "Move-in inspection" }));

    expect(await screen.findByText("File type changed.")).toBeTruthy();
    expect(JSON.parse(String(lastRequest(server, "patch", "/attachments/f2")?.data))).toEqual({ kind: "move_in_inspection" });
    expect(await screen.findByText(/^Move-in inspection, /)).toBeTruthy();
  });

  it("sends nothing when the kind it already is gets picked", async () => {
    const server = startLeaseWritesServer({ lease: aLease({ attachments: [NOTICE] }) });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Change the type of notice.pdf" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Notice" }));
    expect(server.requests.filter((request) => request.method === "patch")).toHaveLength(0);
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it.each([
    [{ status: 500 }, "I couldn't save that. Want to try again?"],
    [{ status: 404 }, "I can't find that file anymore. It may have been deleted."],
    [{ status: 403 }, "You have view-only access, so I can't save this."],
    ["offline" as const, "I can't reach the server, so I couldn't save that. Your changes are still here."],
    [{ status: 409, detail: { code: "ATTACHMENT_BACKS_EXTENSION" } }, "This addendum is the record of an extension. Undo the extension first."],
  ])("tells it in fixed words when the change fails (%j)", async (failure, message) => {
    const server = startLeaseWritesServer({ lease: aLease({ attachments: [NOTICE] }) });
    server.failures.attachmentPatch = failure;
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Change the type of notice.pdf" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Other" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("A developer's message")).toBeNull();
    expect(screen.getByText(/^Notice, /)).toBeTruthy();
  });

  it("doesn't offer it to someone who can only read", async () => {
    const server = startLeaseWritesServer({ role: "viewer", lease: aLease({ attachments: [NOTICE] }) });
    await renderScreen();
    await screen.findByRole("button", { name: "Open notice.pdf" });
    await roleKnown(server);
    expect(screen.queryByRole("button", { name: "Change the type of notice.pdf" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove notice.pdf" })).toBeNull();
  });
});

describe("while a file is being opened", () => {
  it("holds every file's change and remove buttons until it's open", async () => {
    const server = startLeaseWritesServer({ lease: aLease({ attachments: [aFile(), NOTICE] }) });
    await renderScreen();
    await screen.findByRole("button", { name: "Open notice.pdf" });
    await roleKnown(server);
    const answer = api.defaults.adapter as (config: unknown) => Promise<unknown>;
    api.defaults.adapter = ((config: { url?: string }) => (config.url === "/signed-leases/l1" ? new Promise(() => undefined) : answer(config))) as typeof api.defaults.adapter;
    await fireEvent.press(screen.getByRole("button", { name: "Open notice.pdf" }));
    for (const name of ["Remove signed.pdf", "Remove notice.pdf", "Change the type of signed.pdf"]) {
      expect(screen.getByRole("button", { name }).props.accessibilityState?.disabled).toBe(true);
    }
  });
});

describe("removing a file", () => {
  it("asks first, then deletes it and takes it off the page", async () => {
    const server = startLeaseWritesServer({ lease: aLease({ attachments: [aFile(), NOTICE] }) });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Remove notice.pdf" }));
    expect(alert.mock.calls.at(-1)?.[0]).toBe("Remove notice.pdf?");
    expect(lastRequest(server, "delete", "/attachments/f2")).toBeUndefined();

    await act(async () => pressInAlert("Remove"));
    expect(await screen.findByText("File removed.")).toBeTruthy();
    expect(lastRequest(server, "delete", "/attachments/f2")).toBeDefined();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Open notice.pdf" })).toBeNull());
    expect(screen.getByRole("button", { name: "Open signed.pdf" })).toBeTruthy();
  });

  it("does nothing when asked not to", async () => {
    const server = startLeaseWritesServer({ lease: aLease({ attachments: [NOTICE] }) });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Remove notice.pdf" }));
    await act(async () => pressInAlert("Cancel"));
    expect(server.requests.filter((request) => request.method === "delete")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Open notice.pdf" })).toBeTruthy();
  });

  it("asks once however many times it's tapped", async () => {
    startLeaseWritesServer({ lease: aLease({ attachments: [NOTICE] }) });
    await renderScreen();
    const remove = await screen.findByRole("button", { name: "Remove notice.pdf" });
    await fireEvent.press(remove);
    await fireEvent.press(remove);
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it("shows it's working and sends one delete however many times it's confirmed", async () => {
    const server = startLeaseWritesServer({ lease: aLease({ attachments: [NOTICE] }) });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Remove notice.pdf" }));
    holdWrites();
    await act(async () => pressInAlert("Remove"));
    expect(screen.getByRole("button", { name: "Remove notice.pdf" })).toBeDisabled();
    expect(screen.getByText("Removing…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change the type of notice.pdf" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Remove notice.pdf" }));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(server.requests.filter((request) => request.method === "delete")).toHaveLength(0);
  });

  it.each([
    [{ status: 500 }, "I couldn't delete that file. Want to try again?"],
    [{ status: 404 }, "That file was already deleted."],
    [{ status: 409, detail: { code: "ATTACHMENT_BACKS_EXTENSION" } }, "This addendum is the record of an extension. Undo the extension first."],
    ["offline" as const, "I can't reach the server, so I couldn't delete that file."],
  ])("tells it in fixed words when removing fails (%j) and keeps the file", async (failure, message) => {
    const server = startLeaseWritesServer({ lease: aLease({ attachments: [NOTICE] }) });
    server.failures.attachmentDelete = failure;
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Remove notice.pdf" }));
    await act(async () => pressInAlert("Remove"));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("A developer's message")).toBeNull();
    expect(screen.getByRole("button", { name: "Open notice.pdf" })).toBeTruthy();
  });

  it("can remove a file whose copy has gone missing", async () => {
    startLeaseWritesServer({ lease: aLease({ attachments: [aFile({ is_available: false })] }) });
    await renderScreen();
    expect(await screen.findByRole("button", { name: "Remove signed.pdf" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open signed.pdf" })).toBeNull();
  });
});

describe("the lease's notes", () => {
  it("adds notes, sends them trimmed, and shows them", async () => {
    const server = startLeaseWritesServer();
    await renderScreen();
    expect(await screen.findByText("No notes yet.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Add notes" }));
    await fireEvent.changeText(screen.getByLabelText("Anything to remember about this lease"), "  Call about the gate code  ");
    await fireEvent.press(screen.getByRole("button", { name: "Save notes" }));

    expect(await screen.findByText("Notes saved.")).toBeTruthy();
    expect(JSON.parse(String(lastRequest(server, "patch", "/signed-leases/l1")?.data))).toEqual({ notes: "Call about the gate code" });
    expect(screen.getByText("Call about the gate code")).toBeTruthy();
    expect(screen.queryByLabelText("Anything to remember about this lease")).toBeNull();
  });

  it("starts from what's saved, and clears it when emptied", async () => {
    const server = startLeaseWritesServer({ lease: aLease({ notes: "Old note" }) });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Edit notes" }));
    expect(screen.getByDisplayValue("Old note")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Anything to remember about this lease"), "");
    await fireEvent.press(screen.getByRole("button", { name: "Save notes" }));
    await screen.findByText("Notes saved.");
    expect(JSON.parse(String(lastRequest(server, "patch", "/signed-leases/l1")?.data))).toEqual({ notes: "" });
    expect(await screen.findByText("No notes yet.")).toBeTruthy();
  });

  it("loads and saves notes longer than 2000 characters whole, since the server has no limit on them", async () => {
    const long = `${"a".repeat(2400)}END`;
    const server = startLeaseWritesServer({ lease: aLease({ notes: long }) });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Edit notes" }));
    const field = screen.getByLabelText("Anything to remember about this lease");
    expect(field.props.maxLength).toBeUndefined();
    expect(field.props.value).toBe(long);
    await fireEvent.changeText(field, `${long} and more`);
    await fireEvent.press(screen.getByRole("button", { name: "Save notes" }));
    await screen.findByText("Notes saved.");
    expect(JSON.parse(String(lastRequest(server, "patch", "/signed-leases/l1")?.data))).toEqual({ notes: `${long} and more` });
  });

  it("shows it's working and sends one save however many times it's tapped", async () => {
    const server = startLeaseWritesServer();
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Add notes" }));
    await fireEvent.changeText(screen.getByLabelText("Anything to remember about this lease"), "Note");
    holdWrites();
    await fireEvent.press(screen.getByRole("button", { name: "Save notes" }));
    expect(screen.getByText("Saving…")).toBeTruthy();
    expect(screen.getByLabelText("Anything to remember about this lease").props.editable).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Saving…" }));
    expect(server.requests.filter((request) => request.method === "patch")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it.each([
    [{ status: 500 }, "I couldn't save that. Want to try again?"],
    [{ status: 403 }, "You have view-only access, so I can't save this."],
    [{ status: 404 }, "I can't find that lease anymore. It may have been deleted."],
    ["offline" as const, "I can't reach the server, so I couldn't save that. Your changes are still here."],
  ])("tells it in fixed words when saving fails (%j) and keeps what was typed", async (failure, message) => {
    const server = startLeaseWritesServer();
    server.failures.patch = failure;
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Add notes" }));
    await fireEvent.changeText(screen.getByLabelText("Anything to remember about this lease"), "Keep me");
    await fireEvent.press(screen.getByRole("button", { name: "Save notes" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("A developer's message")).toBeNull();
    expect(screen.getByDisplayValue("Keep me")).toBeTruthy();

    delete server.failures.patch;
    await fireEvent.press(screen.getByRole("button", { name: "Save notes" }));
    await screen.findByText("Notes saved.");
  });

  it("asks before throwing away what was typed, and closes freely when nothing changed", async () => {
    startLeaseWritesServer({ lease: aLease({ notes: "Saved" }) });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Edit notes" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(alert).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Anything to remember about this lease")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Edit notes" }));
    await fireEvent.changeText(screen.getByLabelText("Anything to remember about this lease"), "Changed");
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("Changed")).toBeTruthy();
    await act(async () => pressInAlert("Discard"));
    expect(screen.queryByLabelText("Anything to remember about this lease")).toBeNull();
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("lets someone who can only read see the notes but not change them", async () => {
    const server = startLeaseWritesServer({ role: "viewer", lease: aLease({ notes: "Read me" }) });
    await renderScreen();
    expect(await screen.findByText("Read me")).toBeTruthy();
    await roleKnown(server);
    expect(screen.queryByRole("button", { name: "Edit notes" })).toBeNull();
  });

  it("shows a reader no notes section when there are none", async () => {
    const server = startLeaseWritesServer({ role: "viewer" });
    await renderScreen();
    await screen.findByText("March 1, 2026 to February 28, 2027");
    await roleKnown(server);
    expect(screen.queryByText("No notes yet.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a document" })).toBeNull();
  });
});
