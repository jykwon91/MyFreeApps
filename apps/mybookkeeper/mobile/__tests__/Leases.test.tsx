import { LEASE_PAGE_SIZE } from "@mybookkeeper/api-client/constants/leaseLabels";
import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";
import type { SignedLeaseAttachment } from "@mybookkeeper/api-client/types/lease/signed-lease-attachment";
import { signedLeasesApi } from "@mybookkeeper/api-client/store/signedLeasesApi";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as Sharing from "expo-sharing";
import { Linking } from "react-native";
import { Provider } from "react-redux";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { leaseCountdown, leaseTerm, sortLeaseFiles } from "../src/features/leases/leaseDisplay";
import LeaseDetailScreen from "../src/features/leases/LeaseDetailScreen";
import LeaseValuesScreen from "../src/features/leases/LeaseValuesScreen";
import LeasesScreen from "../src/features/leases/LeasesScreen";
import TenantLeases from "../src/features/leases/TenantLeases";
import MoreRow from "../src/features/more/MoreRow";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { fakeDownloads, fakeFiles, resetFakeFiles } from "../test-support/fakeFileSystem";

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), back: () => mockBack() },
}));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));
jest.mock("expo-local-authentication", () => ({ SecurityLevel: { NONE: 0 }, authenticateAsync: jest.fn(), getEnrolledLevelAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const originalAdapter = api.defaults.adapter;

function aFile(overrides: Partial<SignedLeaseAttachment> = {}): SignedLeaseAttachment {
  return {
    id: "f1",
    lease_id: "l1",
    filename: "Signed lease.pdf",
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

function aLease(overrides: Partial<SignedLeaseDetail> = {}): SignedLeaseDetail {
  return {
    id: "l1",
    user_id: "u1",
    organization_id: "w1",
    templates: [],
    applicant_id: "a1",
    applicant_legal_name: "Dana Reed",
    listing_id: null,
    kind: "imported",
    values: { "[DOB]": "1990-01-15", "[PHONE]": "555-0100" },
    status: "active",
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
    ...overrides,
  };
}

interface FakeServer {
  leases: SignedLeaseDetail[];
  role: string;
  offline: boolean;
  listFailure: number | null;
  urlAnswer: (read: number) => string | null;
  requests: AxiosRequestConfig[];
}

function startServer(leases: SignedLeaseDetail[] = []): FakeServer {
  const server: FakeServer = {
    leases,
    role: "owner",
    offline: false,
    listFailure: null,
    urlAnswer: () => "https://files.example/fresh",
    requests: [],
  };
  let detailReads = 0;
  const adapter: AxiosAdapter = (config) => {
    server.requests.push(config);
    if (server.offline) return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    const respond = (data: unknown, status = 200) => {
      const response = { data, status, statusText: "", headers: {}, config };
      if (status < 300) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error("failed"), { isAxiosError: true, config, response }));
    };
    if (config.url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: server.role }]);
    if (config.url === "/signed-leases") {
      if (server.listFailure) return respond({ detail: "nope" }, server.listFailure);
      const params = (config.params ?? {}) as { group?: string; applicant_id?: string; offset?: number; limit?: number };
      const statuses = params.group === "current" ? ["signed", "active"] : params.group === "ended" ? ["ended", "terminated"] : null;
      const rows = server.leases
        .filter((lease) => !statuses || statuses.includes(lease.status))
        .filter((lease) => !params.applicant_id || lease.applicant_id === params.applicant_id);
      const offset = params.offset ?? 0;
      const limit = params.limit ?? 50;
      const items = rows.slice(offset, offset + limit).map((lease) => ({ ...lease, applicant_legal_name: "Dana Reed", template_ids: [] }));
      return respond({ items, total: rows.length, has_more: offset + items.length < rows.length });
    }
    const lease = server.leases.find((row) => config.url === `/signed-leases/${row.id}`);
    if (!lease) return respond({ detail: "Not found" }, 404);
    detailReads += 1;
    const url = server.urlAnswer(detailReads);
    return respond({ ...lease, attachments: lease.attachments.map((file) => ({ ...file, presigned_url: url })) });
  };
  api.defaults.adapter = adapter;
  return server;
}

async function renderIn(element: React.ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

describe("leases", () => {
  beforeEach(() => {
    session.tokenStore.set("token");
    store.dispatch(baseApi.util.resetApiState());
    store.dispatch(workspaceChosen("w1"));
    jest.clearAllMocks();
    resetFakeFiles();
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    jest.restoreAllMocks();
  });

  describe("what the dates say", () => {
    const TODAY = "2026-11-04";

    it.each([
      ["2026-11-14", "Ends in 10 days"],
      ["2026-11-05", "Ends tomorrow"],
      ["2026-11-04", "Ends today"],
      ["2026-11-03", "Ended yesterday"],
      ["2026-10-25", "Ended 10 days ago"],
    ])("counts down to %s for a lease in effect", (endsOn, expected) => {
      expect(leaseCountdown("active", endsOn, TODAY)).toBe(expected);
    });

    it("doesn't count down a lease that ended early or hasn't begun", () => {
      expect(leaseCountdown("terminated", "2026-11-14", TODAY)).toBeNull();
      expect(leaseCountdown("draft", "2026-11-14", TODAY)).toBeNull();
      expect(leaseCountdown("active", null, TODAY)).toBeNull();
    });

    it("doesn't say an ended lease has days left", () => {
      expect(leaseCountdown("ended", "2026-11-14", TODAY)).toBeNull();
      expect(leaseCountdown("ended", "2026-10-25", TODAY)).toBe("Ended 10 days ago");
    });

    it("words a term with either date missing", () => {
      expect(leaseTerm("2026-03-01", "2027-02-28")).toBe("March 1, 2026 to February 28, 2027");
      expect(leaseTerm("2026-03-01", null)).toBe("From March 1, 2026");
      expect(leaseTerm(null, "2027-02-28")).toBe("Through February 28, 2027");
      expect(leaseTerm(null, null)).toBe("No dates yet");
    });

    it("picks the newest signed copy and keeps receipts with the other files", () => {
      const older = aFile({ id: "old", uploaded_at: "2026-01-01T00:00:00Z" });
      const newer = aFile({ id: "new", uploaded_at: "2026-03-01T00:00:00Z" });
      const notice = aFile({ id: "notice", kind: "notice" });
      const receipt = aFile({ id: "receipt", kind: "rent_receipt" });
      const { signedCopy, others } = sortLeaseFiles([older, receipt, notice, newer]);
      expect(signedCopy?.id).toBe("new");
      expect(others.map((file) => file.id)).toEqual(["receipt", "notice", "old"]);
    });
  });

  describe("the list", () => {
    it("starts on current leases and asks the server to filter", async () => {
      const server = startServer([aLease(), aLease({ id: "l2", status: "ended", ends_on: "2020-01-01" })]);
      await renderIn(<LeasesScreen />);
      expect(await screen.findByText("Dana Reed")).toBeTruthy();
      expect(screen.queryAllByText("Dana Reed")).toHaveLength(1);
      const reads = server.requests.filter((request) => request.url === "/signed-leases");
      expect(reads[0].params).toEqual({ group: "current", limit: LEASE_PAGE_SIZE, offset: 0 });
    });

    it("switches to ended and all", async () => {
      startServer([aLease(), aLease({ id: "l2", status: "ended", ends_on: "2020-01-01" }), aLease({ id: "l3", status: "draft" })]);
      await renderIn(<LeasesScreen />);
      await screen.findByText("Dana Reed");
      await fireEvent.press(screen.getByRole("tab", { name: "Ended" }));
      expect(await screen.findByRole("button", { name: /Ended, March 1, 2026/ })).toBeTruthy();
      await fireEvent.press(screen.getByRole("tab", { name: "All" }));
      await waitFor(() => expect(screen.queryAllByText("Dana Reed")).toHaveLength(3));
      expect(screen.getByText("Draft")).toBeTruthy();
    });

    it("opens a lease", async () => {
      startServer([aLease()]);
      await renderIn(<LeasesScreen />);
      await fireEvent.press(await screen.findByRole("button", { name: /Dana Reed/ }));
      expect(mockPush).toHaveBeenCalledWith("/leases/l1");
    });

    it("offers all leases when there are no current ones", async () => {
      startServer([aLease({ status: "draft" })]);
      await renderIn(<LeasesScreen />);
      expect(await screen.findByText("No current leases")).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "See all leases" }));
      expect(await screen.findByText("Dana Reed")).toBeTruthy();
    });

    it("explains an empty account, with the website only for people who can write", async () => {
      const server = startServer();
      server.role = "viewer";
      store.dispatch(baseApi.util.resetApiState());
      await renderIn(<LeasesScreen />);
      await fireEvent.press(await screen.findByRole("tab", { name: "All" }));
      expect(await screen.findByText("No leases yet")).toBeTruthy();
      await waitFor(() => expect(server.requests.some((request) => request.url === "/organizations")).toBe(true));
      expect(screen.queryByRole("button", { name: "Open on the website" })).toBeNull();
    });

    it("explains a failure and retries", async () => {
      const server = startServer([aLease()]);
      server.listFailure = 500;
      await renderIn(<LeasesScreen />);
      expect(await screen.findByText("I couldn't load your leases.")).toBeTruthy();
      server.listFailure = null;
      await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("Dana Reed")).toBeTruthy();
    });

    it("offers writers a way to import a signed lease", async () => {
      startServer([aLease()]);
      await renderIn(<LeasesScreen />);
      await fireEvent.press(await screen.findByRole("button", { name: "Import a signed lease" }));
      expect(mockPush).toHaveBeenCalledWith("/leases/import");
    });

    it("doesn't offer viewers the import", async () => {
      const server = startServer([aLease()]);
      server.role = "viewer";
      await renderIn(<LeasesScreen />);
      await screen.findByText("Dana Reed");
      await waitFor(() => expect(server.requests.some((request) => request.url === "/organizations")).toBe(true));
      expect(screen.queryByRole("button", { name: "Import a signed lease" })).toBeNull();
    });

    it("loads the next page", async () => {
      const many = Array.from({ length: LEASE_PAGE_SIZE + 2 }, (_, index) => aLease({ id: `l${index}` }));
      const server = startServer(many);
      await renderIn(<LeasesScreen />);
      await screen.findAllByText("Dana Reed");
      await fireEvent(screen.getByTestId("leases-list"), "onEndReached");
      await waitFor(() =>
        expect(server.requests.some((request) => request.url === "/signed-leases" && request.params.offset === LEASE_PAGE_SIZE)).toBe(true),
      );
    });
  });

  describe("the lease page", () => {
    it("answers when it ends and what was signed, and shows none of the lease's filled-in values", async () => {
      startServer([aLease({ attachments: [aFile(), aFile({ id: "f2", filename: "Notice.pdf", kind: "notice" })], notes: "Keys returned" })]);
      await renderIn(<LeaseDetailScreen id="l1" />);
      expect(await screen.findByText("March 1, 2026 to February 28, 2099")).toBeTruthy();
      expect(screen.getByText("Active")).toBeTruthy();
      expect(screen.getByText("Signed lease.pdf")).toBeTruthy();
      expect(screen.getByText("Notice.pdf")).toBeTruthy();
      expect(screen.getByText("Keys returned")).toBeTruthy();
      expect(screen.queryByText("1990-01-15")).toBeNull();
      expect(screen.queryByText("555-0100")).toBeNull();
      expect(screen.queryByText("[DOB]", { exact: false })).toBeNull();
    });

    it("links to the tenant from their name", async () => {
      startServer([aLease()]);
      await renderIn(<LeaseDetailScreen id="l1" />);
      await fireEvent.press(await screen.findByText("Dana Reed"));
      expect(mockPush).toHaveBeenCalledWith("/applicants/a1");
    });

    it("still links to a tenant with no name on file", async () => {
      startServer([aLease({ applicant_legal_name: null })]);
      await renderIn(<LeaseDetailScreen id="l1" />);
      await fireEvent.press(await screen.findByText("Tenant"));
      expect(mockPush).toHaveBeenCalledWith("/applicants/a1");
    });

    it("says when there's no signed copy", async () => {
      startServer([aLease()]);
      await renderIn(<LeaseDetailScreen id="l1" />);
      expect(await screen.findByText("No signed copy yet.")).toBeTruthy();
    });

    it("opens a file on a fresh link, keeping its extension but not its name, and removes the copy", async () => {
      const server = startServer([aLease({ attachments: [aFile({ filename: "Dana Reed lease.PDF" })] })]);
      await renderIn(<LeaseDetailScreen id="l1" />);
      const before = (await screen.findByRole("button", { name: "Open Dana Reed lease.PDF" }));
      const reads = server.requests.filter((request) => request.url === "/signed-leases/l1").length;
      await fireEvent.press(before);
      await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith("cache:/documents/f1.PDF", { mimeType: "application/pdf" }));
      expect(server.requests.filter((request) => request.url === "/signed-leases/l1").length).toBe(reads + 1);
      expect(fakeDownloads()).toEqual(["https://files.example/fresh"]);
      await waitFor(() => expect(fakeFiles()).toEqual([]));
    });

    it("explains a file that won't open", async () => {
      const server = startServer([aLease({ attachments: [aFile()] })]);
      await renderIn(<LeaseDetailScreen id="l1" />);
      const open = await screen.findByRole("button", { name: "Open Signed lease.pdf" });
      server.urlAnswer = () => null;
      await fireEvent.press(open);
      expect(await screen.findByText("I couldn't open that file. Want to try again?")).toBeTruthy();
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
    });

    it("says a missing file is missing rather than offering to open it", async () => {
      startServer([aLease({ attachments: [aFile({ is_available: false, presigned_url: null })] })]);
      await renderIn(<LeaseDetailScreen id="l1" />);
      expect(await screen.findByText("This file is missing.")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Open Signed lease.pdf" })).toBeNull();
    });

    it("shows an extension and links to the leases around it", async () => {
      startServer([
        aLease({
          latest_extension: { id: "x", created_at: "2026-01-03T12:00:00Z", starts_on: "2026-03-01", ends_on: "2099-02-28", source_attachment_id: "f1", previous_ends_on: "2098-02-28", undo_expires_at: "2026-02-02T12:00:00Z", can_undo: false },
          parent_lease_id: "l0",
          successor_lease_id: "l9",
        }),
      ]);
      await renderIn(<LeaseDetailScreen id="l1" />);
      expect(await screen.findByText("Extended to February 28, 2099 on January 3, 2026")).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "See the earlier lease" }));
      expect(mockPush).toHaveBeenCalledWith("/leases/l0");
      await fireEvent.press(screen.getByRole("button", { name: "See the newer lease" }));
      expect(mockPush).toHaveBeenCalledWith("/leases/l9");
    });

    it("no longer sends people to the website to manage a lease", async () => {
      startServer([aLease()]);
      const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
      await renderIn(<LeaseDetailScreen id="l1" />);
      await screen.findByRole("button", { name: "Add a document" });
      expect(screen.queryByRole("button", { name: "Manage on the website" })).toBeNull();
      expect(openURL).not.toHaveBeenCalled();
    });

    it("offers viewers no way to manage it", async () => {
      const server = startServer([aLease()]);
      server.role = "viewer";
      await renderIn(<LeaseDetailScreen id="l1" />);
      await screen.findByText("March 1, 2026 to February 28, 2099");
      await waitFor(() => expect(server.requests.some((request) => request.url === "/organizations")).toBe(true));
      expect(screen.queryByRole("button", { name: "Add a document" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Add notes" })).toBeNull();
    });

    it("explains a deleted lease", async () => {
      startServer([]);
      await renderIn(<LeaseDetailScreen id="gone" />);
      expect(await screen.findByText("That lease is gone")).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
      expect(mockBack).toHaveBeenCalled();
    });

    it("explains a failed load and retries", async () => {
      const server = startServer([aLease()]);
      server.offline = true;
      await renderIn(<LeaseDetailScreen id="l1" />);
      expect(await screen.findByText("I couldn't load this lease.")).toBeTruthy();
      server.offline = false;
      await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("March 1, 2026 to February 28, 2099")).toBeTruthy();
    });
  });

  describe("on a tenant's page", () => {
    it("lists only their leases and opens one", async () => {
      startServer([aLease(), aLease({ id: "other", applicant_id: "a2", starts_on: "2001-01-01" })]);
      await renderIn(<TenantLeases applicantId="a1" isTenant name="Dana Reed" />);
      await fireEvent.press(await screen.findByText("March 1, 2026 to February 28, 2099"));
      expect(mockPush).toHaveBeenCalledWith("/leases/l1");
      expect(screen.queryByText("January 1, 2001", { exact: false })).toBeNull();
    });

    it("says a tenant has no lease", async () => {
      startServer();
      await renderIn(<TenantLeases applicantId="a1" isTenant name="Dana Reed" />);
      expect(await screen.findByText("No lease for Dana Reed yet.")).toBeTruthy();
    });

    it("stays out of the way for an applicant with no lease", async () => {
      const server = startServer();
      await renderIn(<TenantLeases applicantId="a1" isTenant={false} name="Dana Reed" />);
      await waitFor(() => expect(server.requests.some((request) => request.url === "/signed-leases")).toBe(true));
      expect(screen.queryByText("Leases")).toBeNull();
    });

    it("offers a retry when their leases won't load", async () => {
      const server = startServer([aLease()]);
      server.listFailure = 500;
      await renderIn(<TenantLeases applicantId="a1" isTenant name="Dana Reed" />);
      expect(await screen.findByText("I couldn't load their leases.")).toBeTruthy();
      server.listFailure = null;
      await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("March 1, 2026 to February 28, 2099")).toBeTruthy();
    });
  });

  describe("in More", () => {
    it("opens the app's screen when it has one", async () => {
      const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
      await renderIn(<MoreRow item={{ label: "Leases", webPath: "/leases", screen: "/leases" }} />);
      await fireEvent.press(screen.getByRole("button", { name: "Leases" }));
      expect(mockPush).toHaveBeenCalledWith("/leases");
      expect(openURL).not.toHaveBeenCalled();
    });

    it("opens the website otherwise", async () => {
      const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
      await renderIn(<MoreRow item={{ label: "Vendors", webPath: "/vendors" }} />);
      await fireEvent.press(screen.getByRole("link", { name: "Vendors" }));
      expect(openURL).toHaveBeenCalledWith(expect.stringContaining("/vendors"));
    });
  });

  describe("the values page", () => {
    it("lists every value, spelling out keys and showing structured and empty ones", async () => {
      startServer([aLease({ values: { tenant_name: "Dana Reed", pets: { dog: 1 }, deposit: null, "[PHONE]": "555-0100" } })]);
      await renderIn(<LeaseValuesScreen id="l1" />);
      expect(await screen.findByText("Tenant name")).toBeTruthy();
      expect(screen.getByText("Dana Reed")).toBeTruthy();
      expect(screen.getByText("Deposit")).toBeTruthy();
      expect(screen.getByText("[PHONE]")).toBeTruthy();
      expect(screen.getByText("555-0100")).toBeTruthy();
      expect(screen.getByText(/"dog"/)).toBeTruthy();
    });

    it("says so when nothing is filled in", async () => {
      startServer([aLease({ values: {} })]);
      await renderIn(<LeaseValuesScreen id="l1" />);
      expect(await screen.findByText("No values are filled in on this lease.")).toBeTruthy();
    });

    it("shows a skeleton while it loads", async () => {
      startServer([aLease()]);
      const answer = api.defaults.adapter as AxiosAdapter;
      api.defaults.adapter = (config) => (config.url === "/signed-leases/l1" ? new Promise(() => undefined) : answer(config));
      await renderIn(<LeaseValuesScreen id="l1" />);
      expect(screen.getByLabelText("Loading this lease's details")).toBeTruthy();
    });

    it("explains a deleted lease", async () => {
      startServer([]);
      await renderIn(<LeaseValuesScreen id="gone" />);
      expect(await screen.findByText("That lease is gone")).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
      expect(mockBack).toHaveBeenCalled();
    });

    it("doesn't call a failed load empty, and tries again", async () => {
      const server = startServer([aLease()]);
      server.offline = true;
      await renderIn(<LeaseValuesScreen id="l1" />);
      expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
      expect(screen.queryByText("No values are filled in on this lease.")).toBeNull();
      server.offline = false;
      await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("[PHONE]")).toBeTruthy();
    });

    it("keeps showing what it loaded, with a banner, when the connection drops", async () => {
      const server = startServer([aLease()]);
      await renderIn(<LeaseValuesScreen id="l1" />);
      await screen.findByText("[PHONE]");
      server.offline = true;
      await act(async () => {
        await store.dispatch(signedLeasesApi.endpoints.getSignedLeaseById.initiate("l1", { forceRefetch: true }));
      });
      expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
      expect(screen.getByText("[PHONE]")).toBeTruthy();
    });
  });
});
