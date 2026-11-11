import { signedLeasesApi } from "@mybookkeeper/api-client/store/signedLeasesApi";
import type { SignedLeaseAttachment } from "@mybookkeeper/api-client/types/lease/signed-lease-attachment";
import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { router } from "expo-router";
import { Alert, type AlertButton } from "react-native";
import { Provider } from "react-redux";
import { aLease } from "../test-support/aLease";
import LeaseDetailScreen from "../src/features/leases/LeaseDetailScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-local-authentication", () => ({ SecurityLevel: { NONE: 0 }, authenticateAsync: jest.fn(), getEnrolledLevelAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const originalAdapter = api.defaults.adapter;

function aFile(kind: SignedLeaseAttachment["kind"]): SignedLeaseAttachment {
  return {
    id: "f1",
    lease_id: "l1",
    filename: "lease.pdf",
    storage_key: "k",
    content_type: "application/pdf",
    size_bytes: 10,
    kind,
    uploaded_by_user_id: "u1",
    uploaded_at: "2026-02-01T12:00:00Z",
    presigned_url: "https://example.com/f1",
    is_available: true,
    is_locked: false,
  };
}

interface FakeServer {
  lease: SignedLeaseDetail | null;
  neighbour: SignedLeaseDetail;
  neighbourReads: number;
  role: string;
  tenantHasEmail: boolean;
  writeFailure: { status: number; detail?: unknown } | "offline" | null;
  /** The server does the work, then the answer is lost. */
  commitsThenFails: boolean;
  readsFail: boolean;
  writes: AxiosRequestConfig[];
  workspaceReads: number;
}

function startServer(lease: SignedLeaseDetail): FakeServer {
  const server: FakeServer = { lease, neighbour: aLease({ id: "l0" }), neighbourReads: 0, role: "owner", tenantHasEmail: true, writeFailure: null, commitsThenFails: false, readsFail: false, writes: [], workspaceReads: 0 };
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
    if (config.url === "/applicants/a1") return respond({ id: "a1", has_contact_email: server.tenantHasEmail });
    if (config.url === "/signed-leases/l0") {
      server.neighbourReads += 1;
      return respond(server.neighbour);
    }
    if (config.method === "get") {
      if (server.readsFail) return offline();
      return server.lease ? respond(server.lease) : respond({ detail: "Lease not found" }, 404);
    }
    server.writes.push(config);
    if (server.writeFailure === "offline") return offline();
    if (server.writeFailure) return respond({ detail: server.writeFailure.detail ?? "nope" }, server.writeFailure.status);
    if (config.method === "delete") {
      server.lease = null;
      return server.commitsThenFails ? respond({ detail: "boom" }, 500) : respond(null, 204);
    }
    return respond({ queued: true }, 202);
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

const EMAIL = { name: "Email lease to Dana Reed" };
const DELETE = { name: "Delete lease for Dana Reed" };

function alertCall() {
  return jest.mocked(Alert.alert).mock.calls[0];
}

function confirmAlert() {
  const buttons: AlertButton[] = alertCall()?.[2] ?? [];
  return act(async () => buttons[1].onPress?.());
}

async function pressAndConfirm(button: { name: string }) {
  await fireEvent.press(await screen.findByRole("button", button));
  await confirmAlert();
}

describe("emailing and deleting a lease", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await session.tokenStore.set("token");
    store.dispatch(baseApi.util.resetApiState());
    store.dispatch(workspaceChosen("w1"));
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    jest.restoreAllMocks();
  });

  describe("emailing", () => {
    it("asks first, because an email can't be unsent, then says it's on its way", async () => {
      const server = startServer(aLease({ attachments: [aFile("signed_lease")] }));
      await renderScreen();
      await fireEvent.press(await screen.findByRole("button", EMAIL));

      expect(alertCall()?.[0]).toBe("Email the lease to Dana Reed?");
      expect(alertCall()?.[1]).toContain("can't be unsent");
      expect(server.writes).toHaveLength(0);

      await confirmAlert();
      expect(server.writes[0].url).toBe("/signed-leases/l1/email-tenant");
      expect(await screen.findByText("I'm emailing the lease to Dana Reed now.")).toBeTruthy();
    });

    it("sends nothing when cancelled, and can ask again", async () => {
      const server = startServer(aLease({ attachments: [aFile("signed_lease")] }));
      await renderScreen();
      const button = await screen.findByRole("button", EMAIL);
      await fireEvent.press(button);
      await act(async () => (alertCall()?.[2] ?? [])[0].onPress?.());
      await fireEvent.press(button);

      expect(server.writes).toHaveLength(0);
      expect(Alert.alert).toHaveBeenCalledTimes(2);
    });

    it("only asks once for a double tap", async () => {
      startServer(aLease({ attachments: [aFile("signed_lease")] }));
      await renderScreen();
      const button = await screen.findByRole("button", EMAIL);
      await fireEvent.press(button);
      await fireEvent.press(button);

      expect(Alert.alert).toHaveBeenCalledTimes(1);
    });

    it("counts a generated lease as something to send", async () => {
      startServer(aLease({ attachments: [aFile("rendered_original")] }));
      await renderScreen();

      expect(await screen.findByRole("button", EMAIL)).toBeTruthy();
    });

    it("doesn't offer it when the server would have nothing to attach", async () => {
      startServer(aLease({ attachments: [aFile("signed_addendum")] }));
      await renderScreen();
      await screen.findByRole("button", DELETE);

      expect(screen.queryByRole("button", EMAIL)).toBeNull();
    });

    it("explains when the tenant has no address", async () => {
      const server = startServer(aLease({ attachments: [aFile("signed_lease")] }));
      server.tenantHasEmail = false;
      await renderScreen();

      expect(await screen.findByText("Dana Reed has no email on file, so I can't email them the lease.")).toBeTruthy();
      expect(screen.queryByRole("button", EMAIL)).toBeNull();
    });

    it("updates when the address has gone since the page opened", async () => {
      const server = startServer(aLease({ attachments: [aFile("signed_lease")] }));
      await renderScreen();
      await screen.findByRole("button", EMAIL);
      server.tenantHasEmail = false;
      server.writeFailure = { status: 422, detail: "applicant_email_missing" };
      await pressAndConfirm(EMAIL);

      expect((await screen.findAllByText("Dana Reed has no email on file, so I can't email them the lease.")).length).toBeGreaterThan(0);
      await waitFor(() => expect(screen.queryByRole("button", EMAIL)).toBeNull());
    });

    it("doesn't claim anything when there's no answer", async () => {
      const server = startServer(aLease({ attachments: [aFile("signed_lease")] }));
      server.writeFailure = "offline";
      await renderScreen();
      await pressAndConfirm(EMAIL);

      expect(await screen.findByText(/I'm not sure that went out/)).toBeTruthy();
    });

    it("offers a retry when the server refuses", async () => {
      const server = startServer(aLease({ attachments: [aFile("signed_lease")] }));
      server.writeFailure = { status: 500 };
      await renderScreen();
      await pressAndConfirm(EMAIL);

      expect(await screen.findByText("I couldn't send that. Want to try again?")).toBeTruthy();
    });

    it("shows when the last email was started", async () => {
      startServer(aLease({ attachments: [aFile("signed_lease")], last_emailed_to_tenant_at: "2026-10-20T12:00:00Z" }));
      await renderScreen();

      expect(await screen.findByText(/^Last email started Oct/)).toBeTruthy();
    });
  });

  describe("deleting", () => {
    it("asks first, naming the tenant and what goes with it", async () => {
      const server = startServer(aLease());
      await renderScreen();
      await fireEvent.press(await screen.findByRole("button", DELETE));

      expect(alertCall()?.[0]).toBe("Delete this lease for Dana Reed?");
      expect(alertCall()?.[1]).toBe("Their signed copy and all attached files go too. This can't be undone.");
      expect((alertCall()?.[2] ?? [])[1].style).toBe("destructive");
      expect(server.writes).toHaveLength(0);
    });

    it("deletes, goes back and says so", async () => {
      const server = startServer(aLease());
      await renderScreen();
      await pressAndConfirm(DELETE);

      expect(server.writes[0].method).toBe("delete");
      expect(server.writes[0].url).toBe("/signed-leases/l1");
      expect(router.back).toHaveBeenCalledTimes(1);
      expect(await screen.findByText("Lease deleted.")).toBeTruthy();
    });

    it("goes to the list when opened from a link with nothing to go back to", async () => {
      jest.mocked(router.canGoBack).mockReturnValueOnce(false);
      startServer(aLease());
      await renderScreen();
      await pressAndConfirm(DELETE);

      expect(router.back).not.toHaveBeenCalled();
      expect(router.replace).toHaveBeenCalledWith("/leases");
    });

    it("counts a lease that's already gone as deleted", async () => {
      const server = startServer(aLease());
      server.writeFailure = { status: 404 };
      await renderScreen();
      await pressAndConfirm(DELETE);

      expect(router.back).toHaveBeenCalledTimes(1);
    });

    it("counts it as done when the server deleted it but the answer was an error", async () => {
      const server = startServer(aLease());
      server.commitsThenFails = true;
      await renderScreen();
      await pressAndConfirm(DELETE);

      await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
      expect(await screen.findByText("Lease deleted.")).toBeTruthy();
    });

    it("says nothing changed when it checks and the lease is still there", async () => {
      const server = startServer(aLease());
      server.writeFailure = { status: 500 };
      await renderScreen();
      await pressAndConfirm(DELETE);

      expect(await screen.findByText("I couldn't delete this lease. Nothing was changed. Want to try again?")).toBeTruthy();
      expect(router.back).not.toHaveBeenCalled();
    });

    it("says it can't tell when it can't check", async () => {
      const server = startServer(aLease());
      await renderScreen();
      await screen.findByRole("button", DELETE);
      server.writeFailure = "offline";
      server.readsFail = true;
      await pressAndConfirm(DELETE);

      expect(await screen.findByText(/I can't tell if that went through/)).toBeTruthy();
      expect(router.back).not.toHaveBeenCalled();
    });

    it("refreshes the lease it followed, which would otherwise keep its link", async () => {
      const server = startServer(aLease({ parent_lease_id: "l0" }));
      store.dispatch(signedLeasesApi.endpoints.getSignedLeaseById.initiate("l0"));
      await waitFor(() => expect(server.neighbourReads).toBe(1));
      const before = server.neighbourReads;
      await renderScreen();
      await pressAndConfirm(DELETE);

      await waitFor(() => expect(server.neighbourReads).toBeGreaterThan(before));
    });
  });

  it("shows neither with view-only access", async () => {
    const server = startServer(aLease({ attachments: [aFile("signed_lease")] }));
    server.role = "viewer";
    await renderScreen();
    await waitFor(() => expect(server.workspaceReads).toBeGreaterThan(0));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(screen.queryByRole("button", EMAIL)).toBeNull();
    expect(screen.queryByRole("button", DELETE)).toBeNull();
  });
});
