import { APPLICATIONS_PAGE_SIZE } from "@myjobhunter/api-client/constants/applicationsPaging";
import { baseApi } from "@platform/core/store/baseApi";
import { lightColors, SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert, Linking, StyleSheet } from "react-native";
import { APPLICATION_SORTS } from "../src/constants/applicationSorts";
import { COMPANY_APPLICATION_SORT_KEYS, COMPANY_APPLICATIONS_MESSAGES as APPS } from "../src/constants/companyApplications";
import { COMPANY_DETAIL_MESSAGES as MESSAGES } from "../src/constants/companyDetail";
import { formatShortDate } from "@myjobhunter/api-client/utils/formatShortDate";
import { store } from "../src/lib/store";
import { alertButton } from "../test-support/alertButton";
import { applicationRecord } from "../test-support/applicationRecord";
import { companyDetailRoutes } from "../test-support/companyDetailRoutes";
import { companyRecord } from "../test-support/companyRecord";
import { serve } from "../test-support/fakeServer";
import { storedItems } from "../test-support/memorySecureStore";
import { mockRouter } from "../test-support/mockRouter";
import { renderCompanyDetail } from "../test-support/renderCompanyDetail";
import { storeSession } from "../test-support/storedSession";
import type { FakeParams } from "../test-support/types/FakeParams";
import type { FakeReply } from "../test-support/types/FakeReply";
import type { SentRequest } from "../test-support/types/SentRequest";

jest.mock("expo-secure-store", () => jest.requireActual("../test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("../test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo-router", () => jest.requireActual("../test-support/mockExpoRouter").mockExpoRouter);

const ID = "c-acme";
const ACME = companyRecord({
  id: ID,
  name: "Acme Corp",
  primary_domain: "acme.com",
  industry: "SaaS",
  size_range: "51-200",
  hq_location: "Chicago, IL",
  description: "Makes everything.",
  created_at: "2026-09-15T12:00:00Z",
});
const STAFF = applicationRecord({ id: "a1", company_id: ID, role_title: "Staff Engineer", location: "Remote, US", remote_type: "remote", applied_at: "2026-10-02T12:00:00Z" });
const SENIOR = applicationRecord({ id: "a2", company_id: ID, role_title: "Senior Engineer" });

const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

const listRequests = (sent: SentRequest[]) => sent.filter(({ route }) => route === "GET /applications");
const deletes = (sent: SentRequest[]) => sent.filter(({ route }) => route === `DELETE /companies/${ID}`);

function pageOf(items: readonly ReturnType<typeof applicationRecord>[], params: FakeParams): FakeReply {
  const offset = Number(params.offset ?? 0);
  const limit = Number(params.limit ?? APPLICATIONS_PAGE_SIZE);
  return { status: 200, data: { items: items.slice(offset, offset + limit), total: items.length } };
}

async function pullToRefresh(): Promise<void> {
  await act(async () => {
    await screen.getByTestId("company-detail").props.refreshControl.props.onRefresh();
  });
}

function deleteButton() {
  return screen.getByRole("button", { name: MESSAGES.delete });
}

beforeEach(() => {
  storedItems.clear();
  storeSession();
  jest.clearAllMocks();
  store.dispatch(baseApi.util.resetApiState());
});

describe("the company screen", () => {
  it("shows a skeleton of the whole screen while the company loads, then everything the website's page shows", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    serve({
      ...companyDetailRoutes(ACME, { applications: [STAFF] }),
      [`GET /companies/${ID}`]: () => new Promise<FakeReply>((resolve) => (answer = resolve)),
    });
    await renderCompanyDetail(ID);

    expect(await screen.findByTestId("company-detail-skeleton")).toBeTruthy();
    expect(screen.getByLabelText(MESSAGES.loading)).toBeTruthy();
    // The same sections as the loaded screen, so nothing jumps when it arrives.
    for (const section of ["header", "overview", "research", "applications"]) {
      expect(screen.getByTestId(`skeleton-company-${section}`, { includeHiddenElements: true })).toBeTruthy();
    }
    expect(screen.getAllByTestId("skeleton-company-fact", { includeHiddenElements: true })).toHaveLength(4);

    await act(async () => answer({ status: 200, data: ACME }));

    expect(await screen.findByRole("header", { name: "Acme Corp" })).toBeTruthy();
    expect(screen.queryByTestId("company-detail-skeleton")).toBeNull();
    expect(screen.getAllByText("SaaS").length).toBeGreaterThan(0);
    expect(screen.getByText("51-200")).toBeTruthy();
    expect(screen.getByLabelText(`${MESSAGES.hqLabel}: Chicago, IL`)).toBeTruthy();
    expect(screen.getByLabelText(`${MESSAGES.createdLabel}: ${formatShortDate(ACME.created_at)}`)).toBeTruthy();
    expect(screen.getByLabelText(`${MESSAGES.domainLabel}: acme.com`)).toBeTruthy();
    expect(screen.getByLabelText(`${MESSAGES.industryLabel}: SaaS`)).toBeTruthy();
    expect(screen.getByText("Makes everything.")).toBeTruthy();

    const website = screen.getByRole("link", { name: "acme.com" });
    expect(website.props.accessibilityHint).toBe(MESSAGES.opensWebsite);
    await fireEvent.press(website);
    expect(openURL).toHaveBeenLastCalledWith("https://acme.com");
  });

  it("puts a dash for the facts a company doesn't have, and leaves out its link, chips and description", async () => {
    const BARE = companyRecord({ id: ID, name: "Bare Co" });
    serve(companyDetailRoutes(BARE));
    await renderCompanyDetail(ID);

    expect(await screen.findByRole("header", { name: "Bare Co" })).toBeTruthy();
    expect(screen.getByLabelText(`${MESSAGES.hqLabel}: ${MESSAGES.none}`)).toBeTruthy();
    expect(screen.getByLabelText(`${MESSAGES.domainLabel}: ${MESSAGES.none}`)).toBeTruthy();
    expect(screen.getByLabelText(`${MESSAGES.industryLabel}: ${MESSAGES.none}`)).toBeTruthy();
    expect(screen.queryAllByTestId("chip")).toHaveLength(0);
    expect(screen.queryByRole("header", { name: MESSAGES.description.toUpperCase() })).toBeNull();
  });

  it("says when the company is gone, with a way back to the list", async () => {
    serve({ ...companyDetailRoutes(ACME), [`GET /companies/${ID}`]: () => ({ status: 404, data: { detail: "Company not found" } }) });
    await renderCompanyDetail(ID);

    expect(await screen.findByText(MESSAGES.cantFind)).toBeTruthy();
    expect(screen.getByText(MESSAGES.maybeDeleted)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.back }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("offers to try again when the company won't load, and shows it once it does", async () => {
    let fails = true;
    serve({ ...companyDetailRoutes(ACME), [`GET /companies/${ID}`]: () => (fails ? { status: 500 } : { status: 200, data: ACME }) });
    await renderCompanyDetail(ID);

    expect(await screen.findByText(MESSAGES.couldntLoad)).toBeTruthy();
    fails = false;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByRole("header", { name: "Acme Corp" })).toBeTruthy();
  });

  it("refreshes the company, its research and its applications on pull, and keeps them under a banner when that fails", async () => {
    let company = ACME;
    let fails = false;
    const sent = serve({
      ...companyDetailRoutes(ACME),
      [`GET /companies/${ID}`]: () => (fails ? { status: 503 } : { status: 200, data: company }),
    });
    await renderCompanyDetail(ID);
    await screen.findByRole("header", { name: "Acme Corp" });
    await screen.findByText(APPS.none);
    const before = sent.length;

    company = { ...ACME, name: "Acme Corporation" };
    await pullToRefresh();
    expect(await screen.findByRole("header", { name: "Acme Corporation" })).toBeTruthy();
    expect(sent.slice(before).map(({ route }) => route).sort()).toEqual(
      ["GET /applications", `GET /companies/${ID}`, `GET /companies/${ID}/research`].sort(),
    );

    fails = true;
    await pullToRefresh();
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("header", { name: "Acme Corporation" })).toBeTruthy();
  });
});

describe("the applications at a company", () => {
  it("lists them as the website's table does, asking for this company's only, and opens one when pressed", async () => {
    const sent = serve(companyDetailRoutes(ACME, { applications: [STAFF, SENIOR] }));
    await renderCompanyDetail(ID);

    expect(await screen.findByRole("header", { name: `${APPS.heading("Acme Corp")} (2)` })).toBeTruthy();
    expect(listRequests(sent)[0]?.params).toEqual({ company_id: ID, sort: "applied", order: "desc", limit: APPLICATIONS_PAGE_SIZE, offset: 0 });
    const row = screen.getByRole("link", { name: `Staff Engineer, Remote, US · Remote · Applied ${new Date(STAFF.applied_at ?? "").toLocaleDateString()}` });
    expect(screen.getByRole("link", { name: "Senior Engineer" })).toBeTruthy();

    await fireEvent.press(row);
    expect(mockRouter.push).toHaveBeenLastCalledWith("/applications/a1");
  });

  it("shows skeleton rows while they load", async () => {
    let answer: () => void = () => undefined;
    serve({
      ...companyDetailRoutes(ACME),
      "GET /applications": () => new Promise<FakeReply>((resolve) => (answer = () => resolve({ status: 200, data: { items: [STAFF], total: 1 } }))),
    });
    await renderCompanyDetail(ID);

    expect(await screen.findByLabelText(APPS.loading)).toBeTruthy();
    expect(screen.getAllByTestId("company-application-skeleton-row", { includeHiddenElements: true }).length).toBeGreaterThan(0);
    await act(async () => answer());
    expect(await screen.findByRole("link", { name: /^Staff Engineer/ })).toBeTruthy();
    expect(screen.queryByLabelText(APPS.loading)).toBeNull();
  });

  it("sorts by the website's columns, either way, on the server", async () => {
    const sent = serve(companyDetailRoutes(ACME, { applications: [STAFF, SENIOR] }));
    await renderCompanyDetail(ID);
    await screen.findByRole("link", { name: "Senior Engineer" });

    let current = APPLICATION_SORTS["applied-desc"].label;
    for (const key of COMPANY_APPLICATION_SORT_KEYS.filter((each) => each !== "applied-desc")) {
      const next = APPLICATION_SORTS[key];
      await fireEvent.press(screen.getByRole("button", { name: `${APPS.sort}, ${current}` }));
      await fireEvent.press(await screen.findByRole("radio", { name: next.label }));
      current = next.label;
      await waitFor(() => expect(listRequests(sent).at(-1)?.params).toEqual({ company_id: ID, sort: next.field, order: next.direction, limit: APPLICATIONS_PAGE_SIZE, offset: 0 }));
      expect(await screen.findByRole("button", { name: `${APPS.sort}, ${current}` })).toBeTruthy();
    }
  });

  it("says when there are none", async () => {
    serve(companyDetailRoutes(ACME));
    await renderCompanyDetail(ID);

    expect(await screen.findByText(APPS.none)).toBeTruthy();
    expect(screen.getByRole("header", { name: `${APPS.heading("Acme Corp")} (0)` })).toBeTruthy();
    expect(screen.queryByRole("button", { name: new RegExp(`^${APPS.sort},`) })).toBeNull();
  });

  it("says when they couldn't load, and loads them on Try again", async () => {
    let fails = true;
    serve({
      ...companyDetailRoutes(ACME),
      "GET /applications": () => (fails ? { status: 500 } : { status: 200, data: { items: [STAFF], total: 1 } }),
    });
    await renderCompanyDetail(ID);

    expect(await screen.findByText(APPS.couldntLoad)).toBeTruthy();
    fails = false;
    await fireEvent.press(screen.getByRole("button", { name: APPS.tryAgain }));
    expect(await screen.findByRole("link", { name: /^Staff Engineer/ })).toBeTruthy();
  });

  it("loads the next page on Show more, says how many are showing, and offers Try again when a page fails", async () => {
    const MANY = Array.from({ length: APPLICATIONS_PAGE_SIZE + 3 }, (_, index) =>
      applicationRecord({ id: `m${index}`, company_id: ID, role_title: `Role ${index}` }),
    );
    let failNextPage = true;
    const sent = serve({
      ...companyDetailRoutes(ACME),
      "GET /applications": (_body, params) => (Number(params.offset) > 0 && failNextPage ? { status: 503 } : pageOf(MANY, params)),
    });
    await renderCompanyDetail(ID);

    expect(await screen.findByText(APPS.showingCount(APPLICATIONS_PAGE_SIZE, MANY.length))).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: APPS.loadMore }));
    expect(await screen.findByText(APPS.couldntLoadMore)).toBeTruthy();
    // The rows already loaded stay.
    expect(screen.getByRole("link", { name: "Role 0" })).toBeTruthy();

    failNextPage = false;
    await fireEvent.press(screen.getByRole("button", { name: APPS.tryAgain }));
    expect(await screen.findByRole("link", { name: `Role ${MANY.length - 1}` })).toBeTruthy();
    expect(screen.queryByRole("button", { name: APPS.loadMore })).toBeNull();
    expect(listRequests(sent).at(-1)?.params).toEqual(expect.objectContaining({ company_id: ID, offset: APPLICATIONS_PAGE_SIZE }));
  });
});

describe("deleting a company", () => {
  it("waits for the applications before Delete can be pressed", async () => {
    let answer: () => void = () => undefined;
    serve({
      ...companyDetailRoutes(ACME),
      "GET /applications": () => new Promise<FakeReply>((resolve) => (answer = () => resolve({ status: 200, data: { items: [], total: 0 } }))),
    });
    await renderCompanyDetail(ID);
    await screen.findByRole("header", { name: "Acme Corp" });

    expect(deleteButton()).toBeDisabled();
    expect(deleteButton().props.accessibilityHint).toBe(MESSAGES.deleteWaiting);
    await act(async () => answer());
    await waitFor(() => expect(deleteButton()).toBeEnabled());
  });

  it("can't be deleted while it has applications, and says why", async () => {
    serve(companyDetailRoutes(ACME, { applications: [STAFF] }));
    await renderCompanyDetail(ID);

    expect(await screen.findByText(MESSAGES.deleteBlocked)).toBeTruthy();
    expect(deleteButton()).toBeDisabled();
  });

  it("asks first, shows the delete in flight at once, says so, and goes back", async () => {
    let answer: () => void = () => undefined;
    const sent = serve({
      ...companyDetailRoutes(ACME),
      [`DELETE /companies/${ID}`]: () => new Promise<FakeReply>((resolve) => (answer = () => resolve({ status: 204 }))),
    });
    await renderCompanyDetail(ID);
    await waitFor(() => expect(deleteButton()).toBeEnabled());

    await fireEvent.press(deleteButton());
    expect(alert).toHaveBeenCalledWith(MESSAGES.deleteTitle("Acme Corp"), MESSAGES.deleteBody, expect.any(Array));
    expect(deletes(sent)).toEqual([]);

    await act(async () => alertButton(MESSAGES.delete).onPress?.());
    expect(screen.getByRole("button", { name: MESSAGES.deleting }).props.accessibilityState).toEqual(expect.objectContaining({ busy: true }));

    await act(async () => answer());
    expect(await screen.findByText(MESSAGES.deleted("Acme Corp"))).toBeTruthy();
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(deletes(sent)).toHaveLength(1);
  });

  it("does nothing when the person keeps it", async () => {
    const sent = serve(companyDetailRoutes(ACME));
    await renderCompanyDetail(ID);
    await waitFor(() => expect(deleteButton()).toBeEnabled());

    await fireEvent.press(deleteButton());
    await act(async () => alertButton(MESSAGES.keep).onPress?.());
    expect(deletes(sent)).toEqual([]);
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("stays and offers a retry when the delete fails", async () => {
    let reply: FakeReply = { status: 500 };
    serve({ ...companyDetailRoutes(ACME), [`DELETE /companies/${ID}`]: () => reply });
    await renderCompanyDetail(ID);
    await waitFor(() => expect(deleteButton()).toBeEnabled());

    await fireEvent.press(deleteButton());
    await act(async () => alertButton(MESSAGES.delete).onPress?.());
    expect(await screen.findByText(MESSAGES.couldntDelete)).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(deleteButton()).toBeEnabled();

    reply = { status: 204 };
    await fireEvent.press(deleteButton());
    await act(async () => alertButton(MESSAGES.delete).onPress?.());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  });

  it("says the server's reason when it refuses because applications still use the company, and reloads them so Delete turns off", async () => {
    const reason = "This company still has 1 application (including deleted ones).";
    // An application added elsewhere since the list loaded: the server sees it, the screen doesn't yet.
    let applications: ReturnType<typeof applicationRecord>[] = [];
    const sent = serve({
      ...companyDetailRoutes(ACME),
      "GET /applications": () => ({ status: 200, data: { items: applications, total: applications.length } }),
      [`DELETE /companies/${ID}`]: () => {
        applications = [STAFF];
        return { status: 409, data: { detail: { code: "COMPANY_HAS_APPLICATIONS", message: reason, application_count: 1 } } };
      },
    });
    await renderCompanyDetail(ID);
    await waitFor(() => expect(deleteButton()).toBeEnabled());
    const listsBefore = listRequests(sent).length;

    await fireEvent.press(deleteButton());
    await act(async () => alertButton(MESSAGES.delete).onPress?.());
    expect(await screen.findByText(reason)).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(await screen.findByText(MESSAGES.deleteBlocked)).toBeTruthy();
    expect(deleteButton()).toBeDisabled();
    expect(screen.getByRole("link", { name: /^Staff Engineer/ })).toBeTruthy();
    expect(listRequests(sent).length).toBeGreaterThan(listsBefore);
  });

  it("treats a company that's already gone as deleted: says so, not as an error, and goes back", async () => {
    let isGone = false;
    serve({
      ...companyDetailRoutes(ACME),
      // Deleted elsewhere since the screen loaded: from now on the server has no such company.
      [`GET /companies/${ID}`]: () => (isGone ? { status: 404, data: { detail: "Company not found" } } : { status: 200, data: ACME }),
      [`DELETE /companies/${ID}`]: () => {
        isGone = true;
        return { status: 404, data: { detail: "Company not found" } };
      },
    });
    await renderCompanyDetail(ID);
    await waitFor(() => expect(deleteButton()).toBeEnabled());

    await fireEvent.press(deleteButton());
    await act(async () => alertButton(MESSAGES.delete).onPress?.());
    expect(await screen.findByText(MESSAGES.gone)).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId("toast").props.style).backgroundColor).toBe(lightColors.toastSuccessBackground);
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  });
});
