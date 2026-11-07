import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";
import { localToday } from "@mybookkeeper/api-client/utils/localToday";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { router } from "expo-router";
import { act } from "react";
import { Alert, type AlertButton } from "react-native";
import { Provider } from "react-redux";
import { NEW_LEASE_MESSAGES as MESSAGES } from "../src/constants/newLease";
import { leaseCanHaveSuccessor, leaseNeedsFiles } from "../src/features/leases/leaseDisplay";
import LeaseDetailScreen from "../src/features/leases/LeaseDetailScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aLease } from "../test-support/aLease";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-local-authentication", () => ({ SecurityLevel: { NONE: 0 }, authenticateAsync: jest.fn(), getEnrolledLevelAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const originalAdapter = api.defaults.adapter;
const alert = jest.spyOn(Alert, "alert");

function startServer(lease: SignedLeaseDetail, options: { role?: string; generateStatus?: number } = {}) {
  const generates: AxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = (config) => {
    const respond = (data: unknown, status = 200) => {
      const response = { data, status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    if (config.url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: options.role ?? "owner" }]);
    if (config.url === "/applicants/a1") return respond({ id: "a1", has_contact_email: true });
    if (config.url === `/signed-leases/${lease.id}/generate`) {
      generates.push(config);
      return respond({ ...lease, status: "generated", attachments: [{ id: "f1", lease_id: lease.id, filename: "lease.pdf", storage_key: "k", content_type: "application/pdf", size_bytes: 10, kind: "rendered_original", uploaded_by_user_id: "u1", uploaded_at: "2026-02-01T12:00:00Z", presigned_url: null, is_available: true }] }, options.generateStatus ?? 200);
    }
    // The reload after making files never answers, so the screen has to go by the generate's own answer.
    if (config.url === `/signed-leases/${lease.id}`) return generates.length > 0 && !options.generateStatus ? new Promise(() => undefined) : respond(lease);
    return respond({ detail: "no" }, 404);
  };
  api.defaults.adapter = adapter;
  return generates;
}

async function renderScreen(id = "l1") {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <LeaseDetailScreen id={id} />
      </ToastProvider>
    </Provider>,
  );
}

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  alert.mockReset();
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

const aDraft = (overrides: Partial<SignedLeaseDetail> = {}) => aLease({ status: "draft", kind: "generated", ...overrides });

describe("making a draft's files", () => {
  it("makes them straight away, since nothing leaves the app", async () => {
    const generates = startServer(aDraft());
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.makeFiles }));
    expect(await screen.findByText(MESSAGES.madeFiles)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.makeFiles })).toBeNull();
    expect(screen.queryByRole("button", { name: MESSAGES.remakeFiles })).toBeNull();
    expect(generates).toHaveLength(1);
    expect(JSON.parse(String(generates[0].data))).toEqual({ today: localToday() });
    expect(alert).not.toHaveBeenCalled();
  });

  it("asks first when making them would email the tenant", async () => {
    const generates = startServer(aDraft({ auto_email_tenant: true }));
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.makeFiles }));
    expect(alert.mock.calls[0][0]).toBe("Make the files and email Dana Reed?");
    expect(generates).toHaveLength(0);
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    await act(async () => buttons.find((button) => button.text === MESSAGES.makeAndEmail)?.onPress?.());
    expect(generates).toHaveLength(1);
  });

  it("doesn't ask once they've already been emailed", async () => {
    const generates = startServer(aDraft({ auto_email_tenant: true, last_emailed_to_tenant_at: "2026-01-01T00:00:00Z" }));
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.makeFiles }));
    expect(alert).not.toHaveBeenCalled();
    expect(generates).toHaveLength(1);
  });

  it.each([
    [500, MESSAGES.makeFilesFailed],
    [503, MESSAGES.storageDown],
  ])("explains a %i", async (status, message) => {
    startServer(aDraft(), { generateStatus: status });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.makeFiles }));
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it("isn't offered to someone with view-only access", async () => {
    startServer(aDraft(), { role: "viewer" });
    await renderScreen();
    await screen.findByText("Dana Reed");
    await act(async () => undefined);
    expect(screen.queryByRole("button", { name: MESSAGES.makeFiles })).toBeNull();
  });
});

describe("starting the next lease", () => {
  it("opens the flow with who it's for and the earlier lease", async () => {
    startServer(aLease({ status: "signed" }));
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.newLease }));
    expect(router.push).toHaveBeenCalledWith("/leases/new?applicant_id=a1&parent_lease_id=l1");
  });

  it("isn't offered when a newer lease exists", async () => {
    startServer(aLease({ status: "signed", successor_lease_id: "l2" }));
    await renderScreen();
    await screen.findByText("Dana Reed");
    expect(screen.queryByRole("button", { name: MESSAGES.newLease })).toBeNull();
  });
});

describe("the rules", () => {
  it.each([
    ["signed", null, true],
    ["active", null, true],
    ["ended", null, true],
    ["draft", null, false],
    ["generated", null, false],
    ["sent", null, false],
    ["terminated", null, false],
    ["signed", "l2", false],
  ] as const)("a %s lease with successor %s: %s", (status, successor_lease_id, expected) => {
    expect(leaseCanHaveSuccessor({ status, successor_lease_id })).toBe(expected);
  });

  it("only generated leases without files need them", () => {
    expect(leaseNeedsFiles({ kind: "generated", status: "draft", attachments: [] })).toBe(true);
    expect(leaseNeedsFiles({ kind: "generated", status: "generated", attachments: [] })).toBe(true);
    expect(leaseNeedsFiles({ kind: "imported", status: "draft", attachments: [] })).toBe(false);
    // Making files would move these back to generated.
    expect(leaseNeedsFiles({ kind: "generated", status: "sent", attachments: [] })).toBe(false);
    expect(leaseNeedsFiles({ kind: "generated", status: "signed", attachments: [] })).toBe(false);
  });
});
