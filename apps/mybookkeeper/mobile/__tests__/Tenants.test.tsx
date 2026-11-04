import { APPLICANT_PAGE_SIZE } from "@mybookkeeper/api-client/constants/applicantLabels";
import { localToday } from "@mybookkeeper/api-client/utils/tenancyState";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { Provider } from "react-redux";
import ApplicantDetailScreen from "../src/features/applicants/ApplicantDetailScreen";
import PeopleScreen from "../src/features/people/PeopleScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { anApplicant, startApplicantServer } from "../test-support/applicantsServer";

const mockParams: { section?: string; tenancy?: string; stage?: string } = {};
const mockPush = jest.fn();
const mockSetParams = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => mockParams,
  router: { push: (path: string) => mockPush(path), back: jest.fn(), setParams: (next: object) => mockSetParams(next) },
}));
jest.mock("expo-local-authentication", () => ({ SecurityLevel: { NONE: 0 }, authenticateAsync: jest.fn(), getEnrolledLevelAsync: jest.fn() }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({}));
jest.mock("expo-image-manipulator", () => ({}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;
const FUTURE = "2099-03-01";
const PAST = "2020-03-01";
const END_BODY = "I'll move them to Ended. This doesn't message them or change their lease, and you can restart it later.";

function aTenant(overrides: Parameters<typeof anApplicant>[0] = {}) {
  return anApplicant({ stage: "lease_signed", contract_end: FUTURE, ...overrides });
}

async function renderIn(element: React.ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

const renderList = () => renderIn(<PeopleScreen />);
const renderDetail = () => renderIn(<ApplicantDetailScreen id="a1" />);

describe("tenants", () => {
  beforeEach(() => {
    session.tokenStore.set("token");
    store.dispatch(baseApi.util.resetApiState());
    store.dispatch(workspaceChosen("w1"));
    jest.clearAllMocks();
    mockParams.section = "tenants";
    delete mockParams.tenancy;
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    jest.restoreAllMocks();
  });

  describe("the list", () => {
    it("shows current tenants, with no chip on an active one, and opens one", async () => {
      startApplicantServer([aTenant(), aTenant({ id: "a2", legal_name: "Applying", stage: "approved" })]);
      await renderList();
      const row = await screen.findByRole("button", { name: /^Dana Reed, Active, Through Mar 1, Memorial Hospital$/ });
      expect(screen.queryByText("Active")).toBeNull();
      expect(screen.queryByText("Applying")).toBeNull();
      await fireEvent.press(row);
      expect(mockPush).toHaveBeenCalledWith("/applicants/a1");
    });

    it("leaves ended and expired tenants out of Current", async () => {
      startApplicantServer([
        aTenant({ tenant_ended_at: "2026-10-03T12:00:00Z" }),
        aTenant({ id: "a2", contract_end: PAST }),
      ]);
      await renderList();
      expect(await screen.findByText("No one is staying with you right now")).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "See everyone" }));
      expect(mockSetParams).toHaveBeenCalledWith({ tenancy: "everyone" });
    });

    it("shows who's ended and whose lease expired under Everyone", async () => {
      mockParams.tenancy = "everyone";
      startApplicantServer([
        aTenant({ tenant_ended_at: "2026-10-03T12:00:00Z", legal_name: "Ended Early" }),
        aTenant({ id: "a2", contract_end: PAST, legal_name: "Ran Out" }),
      ]);
      await renderList();
      expect(await screen.findByText("Ended Oct 3")).toBeTruthy();
      expect(screen.getByText("Ended")).toBeTruthy();
      expect(screen.getByText("Lease ended Mar 1")).toBeTruthy();
      expect(screen.getByText("Lease expired")).toBeTruthy();
    });

    it("tells the server the phone's date, so the two agree on whose lease is over", async () => {
      const server = startApplicantServer([aTenant()]);
      await renderList();
      await screen.findByText("Dana Reed");
      const request = server.requests.find((candidate) => candidate.url === "/applicants/tenants");
      expect(request?.params).toEqual(expect.objectContaining({ include_ended: false, today: localToday() }));
    });

    it("points to applicants when there's no one at all", async () => {
      mockParams.tenancy = "everyone";
      startApplicantServer([]);
      await renderList();
      expect(await screen.findByText("No tenants yet")).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "See applicants" }));
      expect(mockSetParams).toHaveBeenCalledWith({ section: "applicants", tenancy: undefined });
    });

    it("says when it can't load, and tries again", async () => {
      const server = startApplicantServer([aTenant()]);
      server.tenantListFailure = 500;
      await renderList();
      expect(await screen.findByText("I couldn't load your tenants.")).toBeTruthy();
      server.tenantListFailure = null;
      await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("Dana Reed")).toBeTruthy();
    });

    it("asks the server for the next page", async () => {
      const rows = Array.from({ length: APPLICANT_PAGE_SIZE + 5 }, (_, index) => aTenant({ id: `t${index}`, legal_name: `Tenant ${index}` }));
      const server = startApplicantServer(rows);
      await renderList();
      await screen.findByText("Tenant 0");
      await fireEvent(screen.getByTestId("tenants-list"), "onEndReached");
      const offsets = () => server.requests.filter((request) => request.url === "/applicants/tenants").map((request) => (request.params as { offset: number }).offset);
      await waitFor(() => expect(offsets()).toEqual([0, APPLICANT_PAGE_SIZE]));
    });
  });

  describe("an active tenant", () => {
    it("reloads their payments when the page is pulled", async () => {
      const server = startApplicantServer([aTenant()]);
      await renderDetail();
      await screen.findByText("Payments");
      await waitFor(() => expect(server.requests.filter((request) => request.url === "/transactions")).toHaveLength(1));

      const scroller = screen.getByTestId("applicant-detail");
      await act(async () => scroller.props.refreshControl.props.onRefresh());

      await waitFor(() => expect(server.requests.filter((request) => request.url === "/transactions")).toHaveLength(2));
    });

    it("shows their payments, which someone still applying doesn't have", async () => {
      const consoleError = jest.spyOn(console, "error");
      startApplicantServer([aTenant()]);
      await renderDetail();
      expect(await screen.findByText("Payments")).toBeTruthy();
      expect(consoleError.mock.calls.flat().join(" ")).not.toContain("same key");
      consoleError.mockRestore();
      await screen.unmount();

      store.dispatch(baseApi.util.resetApiState());
      startApplicantServer([aTenant({ stage: "approved" })]);
      await renderDetail();
      await screen.findByText("Details");
      expect(screen.queryByText("Payments")).toBeNull();
    });

    it("shows the state first and hides what's only for applicants", async () => {
      startApplicantServer([aTenant()]);
      await renderDetail();
      expect(await screen.findByText("Active")).toBeTruthy();
      expect(screen.getByText("Through Mar 1")).toBeTruthy();
      expect(screen.queryByText(/^Promoted/)).toBeNull();
      expect(screen.queryByRole("button", { name: /^Stage:/ })).toBeNull();
    });

    it("isn't shown tenancy on an applicant", async () => {
      startApplicantServer([anApplicant()]);
      await renderDetail();
      await screen.findByText(/^Promoted/);
      expect(screen.queryByRole("button", { name: "End tenancy" })).toBeNull();
    });

    it("ends with a reason, after saying what that does, and moves them to Ended", async () => {
      const server = startApplicantServer([aTenant()]);
      await renderDetail();
      await fireEvent.press(await screen.findByRole("button", { name: "End tenancy" }));
      expect(screen.getByText("End tenancy for Dana Reed?")).toBeTruthy();
      expect(screen.getByText(END_BODY)).toBeTruthy();
      expect(server.requests.some((request) => request.url?.endsWith("/tenancy/end"))).toBe(false);
      await fireEvent.changeText(screen.getByLabelText("Reason (optional)"), "  Moved out early  ");
      await fireEvent.press(screen.getAllByRole("button", { name: "End tenancy" }).at(-1)!);
      expect(await screen.findByText("Tenancy ended for Dana Reed.")).toBeTruthy();
      const request = server.requests.find((candidate) => candidate.url?.endsWith("/tenancy/end"));
      expect(JSON.parse(String(request?.data))).toEqual({ reason: "Moved out early" });
      expect(screen.queryByText(END_BODY)).toBeNull();
      expect(await screen.findByText("Moved out early")).toBeTruthy();
      expect(await screen.findByRole("button", { name: "Restart tenancy" })).toBeTruthy();
    });

    it("sends no reason when there isn't one", async () => {
      const server = startApplicantServer([aTenant()]);
      await renderDetail();
      await fireEvent.press(await screen.findByRole("button", { name: "End tenancy" }));
      await fireEvent.changeText(screen.getByLabelText("Reason (optional)"), "   ");
      await fireEvent.press(screen.getAllByRole("button", { name: "End tenancy" }).at(-1)!);
      await screen.findByText("Tenancy ended for Dana Reed.");
      const request = server.requests.find((candidate) => candidate.url?.endsWith("/tenancy/end"));
      expect(JSON.parse(String(request?.data))).toEqual({ reason: null });
    });

    it("can back out without ending", async () => {
      const server = startApplicantServer([aTenant()]);
      await renderDetail();
      await fireEvent.press(await screen.findByRole("button", { name: "End tenancy" }));
      await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText(END_BODY)).toBeNull();
      expect(server.requests.some((request) => request.url?.endsWith("/tenancy/end"))).toBe(false);
    });

    it("keeps the sheet and the reason when ending fails, then can try again", async () => {
      const server = startApplicantServer([aTenant()]);
      server.writeFailure = 500;
      await renderDetail();
      await fireEvent.press(await screen.findByRole("button", { name: "End tenancy" }));
      await fireEvent.changeText(screen.getByLabelText("Reason (optional)"), "Moved out");
      await fireEvent.press(screen.getAllByRole("button", { name: "End tenancy" }).at(-1)!);
      expect(await screen.findByText("I couldn't end the tenancy. Want me to try again?")).toBeTruthy();
      expect(screen.getByDisplayValue("Moved out")).toBeTruthy();
      server.writeFailure = null;
      await fireEvent.press(screen.getAllByRole("button", { name: "End tenancy" }).at(-1)!);
      expect(await screen.findByText("Tenancy ended for Dana Reed.")).toBeTruthy();
    });

    it("explains no connection", async () => {
      const server = startApplicantServer([aTenant()]);
      await renderDetail();
      await fireEvent.press(await screen.findByRole("button", { name: "End tenancy" }));
      server.offline = true;
      await fireEvent.press(screen.getAllByRole("button", { name: "End tenancy" }).at(-1)!);
      expect(await screen.findByText("I couldn't reach the server. Check your connection and try again.")).toBeTruthy();
    });

    it("refreshes the list too on a conflict", async () => {
      const server = startApplicantServer([aTenant()]);
      await renderIn(
        <>
          <PeopleScreen />
          <ApplicantDetailScreen id="a1" />
        </>,
      );
      await screen.findAllByText("Through Mar 1", { exact: false });
      const listReads = () => server.requests.filter((request) => request.url === "/applicants/tenants").length;
      const before = listReads();
      server.writeFailure = 409;
      await fireEvent.press(await screen.findByRole("button", { name: "End tenancy" }));
      await fireEvent.press(screen.getAllByRole("button", { name: "End tenancy" }).at(-1)!);
      await screen.findByText("That tenancy changed since you opened it. I've refreshed it.");
      await waitFor(() => expect(listReads()).toBeGreaterThan(before));
    });

    it("closes and refreshes on a conflict", async () => {
      const server = startApplicantServer([aTenant()]);
      server.writeFailure = 409;
      await renderDetail();
      await fireEvent.press(await screen.findByRole("button", { name: "End tenancy" }));
      const reads = server.requests.filter((request) => request.url === "/applicants/a1").length;
      await fireEvent.press(screen.getAllByRole("button", { name: "End tenancy" }).at(-1)!);
      expect(await screen.findByText("That tenancy changed since you opened it. I've refreshed it.")).toBeTruthy();
      expect(screen.queryByText(END_BODY)).toBeNull();
      await waitFor(() => expect(server.requests.filter((request) => request.url === "/applicants/a1").length).toBeGreaterThan(reads));
    });
  });

  describe("an ended tenant", () => {
    const ended = () => aTenant({ tenant_ended_at: "2026-10-03T12:00:00Z", tenant_ended_reason: "Moved out" });

    it("shows when and why, and restarts", async () => {
      const server = startApplicantServer([ended()]);
      await renderDetail();
      expect(await screen.findByText("Ended Oct 3")).toBeTruthy();
      expect(screen.getByText("Moved out")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "End tenancy" })).toBeNull();
      await fireEvent.press(screen.getByRole("button", { name: "Restart tenancy" }));
      expect(await screen.findByText("Tenancy restarted for Dana Reed.")).toBeTruthy();
      expect(server.requests.filter((request) => request.url?.endsWith("/tenancy/restart"))).toHaveLength(1);
      expect(await screen.findByRole("button", { name: "End tenancy" })).toBeTruthy();
      expect(screen.queryByText("Moved out")).toBeNull();
    });

    it.each([
      [500, "I couldn't restart the tenancy. Want me to try again?"],
      [409, "That tenancy changed since you opened it. I've refreshed it."],
    ])("explains a %i on restart", async (status, message) => {
      const server = startApplicantServer([ended()]);
      server.writeFailure = status;
      await renderDetail();
      await fireEvent.press(await screen.findByRole("button", { name: "Restart tenancy" }));
      expect(await screen.findByText(message)).toBeTruthy();
    });

    it("explains no connection on restart", async () => {
      const server = startApplicantServer([ended()]);
      await renderDetail();
      const restart = await screen.findByRole("button", { name: "Restart tenancy" });
      server.offline = true;
      await act(async () => { fireEvent.press(restart); });
      expect(await screen.findByText("I couldn't reach the server. Check your connection and try again.")).toBeTruthy();
    });
  });

  describe("an expired lease", () => {
    it("says what brings them back and offers neither end nor restart", async () => {
      startApplicantServer([aTenant({ contract_end: PAST })]);
      const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
      await renderDetail();
      expect(await screen.findByText("Lease expired")).toBeTruthy();
      expect(screen.getByText("Lease ended Mar 1")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "End tenancy" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Restart tenancy" })).toBeNull();
      await fireEvent.press(screen.getByRole("button", { name: "Add or extend a lease on the website" }));
      expect(openURL).toHaveBeenCalledWith(expect.stringContaining("/tenants/a1"));
    });

    it("still doesn't offer restart when it was also ended by hand, and shows why", async () => {
      startApplicantServer([aTenant({ contract_end: PAST, tenant_ended_at: "2020-01-01T12:00:00Z", tenant_ended_reason: "Moved out" })]);
      await renderDetail();
      expect(await screen.findByText("Moved out")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Restart tenancy" })).toBeNull();
    });
  });

  it("gives a viewer the state and no actions", async () => {
    const server = startApplicantServer([aTenant()]);
    server.role = "viewer";
    await renderDetail();
    expect(await screen.findByText("You have view-only access.")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "End tenancy" })).toBeNull();
  });
});
