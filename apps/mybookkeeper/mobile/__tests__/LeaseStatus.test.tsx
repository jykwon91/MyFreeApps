import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";
import type { SignedLeaseStatus } from "@mybookkeeper/api-client/types/lease/signed-lease-status";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { Alert, type AlertButton, Platform } from "react-native";
import { Provider } from "react-redux";
import { leaseStatusMoves } from "../src/features/leases/leaseDisplay";
import LeaseDetailScreen from "../src/features/leases/LeaseDetailScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-local-authentication", () => ({ SecurityLevel: { NONE: 0 }, authenticateAsync: jest.fn(), getEnrolledLevelAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const mockModal: { onDismiss?: () => void; staysWhileClosing?: boolean } = {};
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, onDismiss, children }: { visible: boolean; onDismiss?: () => void; children: unknown }) => {
    if (onDismiss) mockModal.onDismiss = onDismiss;
    return visible || mockModal.staysWhileClosing ? children : null;
  },
}));

const originalAdapter = api.defaults.adapter;

interface FakeServer {
  status: SignedLeaseStatus;
  role: string;
  writeFailure: number | "offline" | null;
  movedElsewhereTo: SignedLeaseStatus | null;
  holdWrites: boolean;
  releaseWrite: () => void;
  holdReads: boolean;
  releaseRead: () => void;
  patches: AxiosRequestConfig[];
  workspaceReads: number;
}

function aLease(status: SignedLeaseStatus): SignedLeaseDetail {
  return {
    id: "l1",
    user_id: "u1",
    organization_id: "w1",
    templates: [],
    applicant_id: "a1",
    applicant_legal_name: "Dana Reed",
    listing_id: null,
    kind: "imported",
    values: {},
    status,
    starts_on: "2026-03-01",
    ends_on: "2099-02-28",
    notes: null,
    generated_at: null,
    sent_at: null,
    signed_at: null,
    ended_at: null,
    auto_email_tenant: false,
    last_emailed_to_tenant_at: null,
    created_at: "2026-02-01T12:00:00Z",
    updated_at: "2026-02-01T12:00:00Z",
    attachments: [],
    latest_extension: null,
    parent_lease_id: null,
    successor_lease_id: null,
    documents_locked: false,
  };
}

function startServer(status: SignedLeaseStatus, role = "owner"): FakeServer {
  const server: FakeServer = { status, role, writeFailure: null, movedElsewhereTo: null, holdWrites: false, releaseWrite: () => {}, holdReads: false, releaseRead: () => {}, patches: [], workspaceReads: 0 };
  const adapter: AxiosAdapter = async (config) => {
    const respond = (data: unknown, code = 200) => {
      const response = { data, status: code, statusText: "", headers: {}, config };
      if (code < 300) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error("failed"), { isAxiosError: true, config, response }));
    };
    if (config.url === "/organizations") server.workspaceReads += 1;
    if (config.url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: server.role }]);
    if (config.method === "patch") {
      server.patches.push(config);
      if (server.holdWrites) await new Promise<void>((resolve) => { server.releaseWrite = resolve; });
      if (server.movedElsewhereTo) server.status = server.movedElsewhereTo;
      if (server.writeFailure === "offline") return Promise.reject(Object.assign(new Error("Network Error"), { config }));
      if (server.writeFailure) return respond({ detail: "Cannot move from 'x' to 'y'" }, server.writeFailure);
      server.status = (JSON.parse(String(config.data)) as { status: SignedLeaseStatus }).status;
    } else if (server.holdReads) {
      await new Promise<void>((resolve) => { server.releaseRead = resolve; });
    }
    return respond(aLease(server.status));
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

const CHANGE = { name: "Change status" };

async function choose(status: string) {
  await fireEvent.press(await screen.findByRole("button", CHANGE));
  await fireEvent.press(await screen.findByRole("radio", { name: status }));
  await act(async () => mockModal.onDismiss?.());
}

function confirmButtons(): AlertButton[] {
  return jest.mocked(Alert.alert).mock.calls[0]?.[2] ?? [];
}

describe("changing a lease's status", () => {
  beforeEach(() => {
    session.tokenStore.set("token");
    store.dispatch(baseApi.util.resetApiState());
    store.dispatch(workspaceChosen("w1"));
    jest.clearAllMocks();
    mockModal.staysWhileClosing = false;
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    jest.restoreAllMocks();
  });

  it.each([
    ["generated", ["Sent", "Signed"]],
    ["sent", ["Signed"]],
    ["signed", ["Active"]],
    ["active", ["Ended", "Terminated"]],
  ] as const)("offers only the allowed moves from %s", async (status, labels) => {
    startServer(status);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", CHANGE));
    expect(screen.getAllByRole("radio")).toHaveLength(labels.length);
    for (const label of labels) expect(screen.getByRole("radio", { name: label })).toBeTruthy();
  });

  it.each(["ended", "terminated"] as const)("has nothing to change once %s", async (status) => {
    startServer(status);
    await renderScreen();
    await waitFor(() => expect(screen.getByRole("button", { name: "Add a document" })).toBeTruthy());
    expect(screen.queryByRole("button", CHANGE)).toBeNull();
  });

  it("leaves a draft for the website, where its document gets generated", async () => {
    startServer("draft");
    await renderScreen();
    await waitFor(() => expect(screen.getByRole("button", { name: "Add a document" })).toBeTruthy());
    expect(screen.queryByRole("button", CHANGE)).toBeNull();
  });

  it("doesn't offer it with view-only access", async () => {
    const server = startServer("active", "viewer");
    await renderScreen();
    await waitFor(() => expect(server.workspaceReads).toBeGreaterThan(0));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(screen.queryByRole("button", CHANGE)).toBeNull();
  });

  it("moves straight on when the next status isn't final", async () => {
    const server = startServer("signed");
    await renderScreen();
    await choose("Active");
    expect(await screen.findByText("Marked as active.")).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(JSON.parse(String(server.patches[0].data))).toEqual({ status: "active" });
    expect(await screen.findByText("Active")).toBeTruthy();
  });

  it.each([
    ["Ended", "ended"],
    ["Terminated", "terminated"],
  ])("asks first before %s, which can't be undone", async (label, status) => {
    const server = startServer("active");
    await renderScreen();
    await choose(label);
    expect(jest.mocked(Alert.alert).mock.calls[0][0]).toBe(`Mark as ${status}?`);
    expect(jest.mocked(Alert.alert).mock.calls[0][1]).toBe("This is final. You can't change it back.");
    expect(server.patches).toHaveLength(0);

    await act(async () => confirmButtons()[1].onPress?.());
    expect(await screen.findByText(`Marked as ${status}.`)).toBeTruthy();
    expect(JSON.parse(String(server.patches[0].data))).toEqual({ status });
    await waitFor(() => expect(screen.queryByRole("button", CHANGE)).toBeNull());
  });

  it("changes nothing when you say not now", async () => {
    const server = startServer("active");
    await renderScreen();
    await choose("Terminated");
    expect(confirmButtons()[0]).toMatchObject({ text: "Not now", style: "cancel" });
    await act(async () => {
      confirmButtons()[0].onPress?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(server.patches).toHaveLength(0);
    expect(screen.queryByText("Marked as terminated.")).toBeNull();
  });

  it("waits for the sheet to finish closing, because iOS drops an alert raised before that", async () => {
    const server = startServer("active");
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", CHANGE));
    await fireEvent.press(await screen.findByRole("radio", { name: "Terminated" }));
    expect(Alert.alert).not.toHaveBeenCalled();
    await act(async () => mockModal.onDismiss?.());
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(server.patches).toHaveLength(0);
  });

  it("acts on a choice once, however often the sheet reports closing", async () => {
    const server = startServer("signed");
    await renderScreen();
    await choose("Active");
    await act(async () => mockModal.onDismiss?.());
    await screen.findByText("Marked as active.");
    expect(server.patches).toHaveLength(1);
  });

  it("keeps the first choice when a second row is tapped as the sheet slides away", async () => {
    const server = startServer("generated");
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", CHANGE));
    mockModal.staysWhileClosing = true;
    await fireEvent.press(await screen.findByRole("radio", { name: "Sent" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Signed" }));
    mockModal.staysWhileClosing = false;
    await act(async () => mockModal.onDismiss?.());
    await screen.findByText("Marked as sent.");
    expect(JSON.parse(String(server.patches[0].data))).toEqual({ status: "sent" });
  });

  it("acts once the sheet closes on Android, which has no dismiss event", async () => {
    const original = Platform.OS;
    Platform.OS = "android";
    try {
      const server = startServer("signed");
      await renderScreen();
      await fireEvent.press(await screen.findByRole("button", CHANGE));
      await fireEvent.press(await screen.findByRole("radio", { name: "Active" }));
      await screen.findByText("Marked as active.");
      expect(server.patches).toHaveLength(1);
    } finally {
      Platform.OS = original;
    }
  });

  it("shows the new status as soon as the server answers, without waiting on a reload", async () => {
    const server = startServer("signed");
    await renderScreen();
    server.holdReads = true;
    await choose("Active");
    await screen.findByText("Marked as active.");
    expect(screen.getByText("Active")).toBeTruthy();
    server.releaseRead();
  });

  it("offers no moves for a status this version of the app doesn't know", () => {
    expect(leaseStatusMoves("expired" as SignedLeaseStatus)).toEqual([]);
  });

  it("changes nothing when the sheet closes without a choice", async () => {
    const server = startServer("active");
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", CHANGE));
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await act(async () => mockModal.onDismiss?.());
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(server.patches).toHaveLength(0);
  });

  it("shows it's working and can't fire twice", async () => {
    const server = startServer("signed");
    server.holdWrites = true;
    await renderScreen();
    await choose("Active");
    const button = await screen.findByRole("button", { name: "Changing…" });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(server.patches).toHaveLength(1);
    await act(async () => server.releaseWrite());
    expect(await screen.findByText("Marked as active.")).toBeTruthy();
  });

  it("shows the latest status when it changed somewhere else", async () => {
    const server = startServer("signed");
    await renderScreen();
    server.movedElsewhereTo = "active";
    server.writeFailure = 400;
    await choose("Active");
    expect(await screen.findByText("This lease's status changed somewhere else. Here's the latest.")).toBeTruthy();
    expect(await screen.findByText("Active")).toBeTruthy();
    expect(screen.queryByText("Cannot move from 'x' to 'y'")).toBeNull();
  });

  it.each([
    [403, "You have view-only access."],
    [404, "That lease is gone."],
    [500, "I couldn't change the status. Want to try again?"],
    ["offline", "I couldn't change the status. Want to try again?"],
  ] as const)("says so when the server answers %s", async (failure, message) => {
    const server = startServer("signed");
    await renderScreen();
    server.writeFailure = failure;
    await choose("Active");
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("Marked as active.")).toBeNull();
  });

  it("works again after a failure", async () => {
    const server = startServer("signed");
    await renderScreen();
    server.writeFailure = "offline";
    await choose("Active");
    expect(await screen.findByText("I couldn't change the status. Want to try again?")).toBeTruthy();
    server.writeFailure = null;
    await choose("Active");
    expect(await screen.findByText("Marked as active.")).toBeTruthy();
    expect(server.patches).toHaveLength(2);
  });
});
