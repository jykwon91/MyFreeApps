import { APPLICATIONS_PAGE_SIZE } from "@myjobhunter/api-client/constants/applicationsPaging";
import { applicationsApi } from "@myjobhunter/api-client/store/applicationsApi";
import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE, ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { Provider } from "react-redux";
import { APPLICATION_SORT_KEYS, APPLICATION_SORTS } from "../src/constants/applicationSorts";
import { APPLICATION_MESSAGES } from "../src/constants/applications";
import ApplicationsScreen from "../src/features/applications/ApplicationsScreen";
import { store } from "../src/lib/store";
import { applicationDetailRecord } from "../test-support/applicationDetailRecord";
import { applicationRecord } from "../test-support/applicationRecord";
import { serve } from "../test-support/fakeServer";
import { storedItems } from "../test-support/memorySecureStore";
import { renderApp } from "../test-support/renderApp";
import { storeSession, tokens } from "../test-support/storedSession";
import type { FakeParams } from "../test-support/types/FakeParams";
import type { FakeReply } from "../test-support/types/FakeReply";

jest.mock("expo-secure-store", () => jest.requireActual("../test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("../test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const STRIPE = applicationRecord({
  id: "app-stripe",
  company_name: "Stripe",
  role_title: "Staff Engineer",
  latest_status: "interview_scheduled",
  location: "Seattle, WA",
  remote_type: "hybrid",
  applied_at: "2026-10-20T12:00:00Z",
  fit_score: "85",
});
const AIRBNB = applicationRecord({
  id: "app-airbnb",
  company_name: "Airbnb",
  role_title: "Senior Engineer",
  latest_status: "applied",
  remote_type: "remote",
  applied_at: "2026-09-02T12:00:00Z",
  fit_score: "92.50",
});
const LYFT = applicationRecord({
  id: "app-lyft",
  company_name: "Lyft",
  role_title: "Principal Engineer",
  latest_status: "offer_received",
  applied_at: "2026-08-01T12:00:00Z",
  fit_score: "100",
});
const DRAFT = applicationRecord({ id: "app-draft", company_name: "Zillow", role_title: "Engineer" });
// The server sorts; the phone shows rows in the order they arrive.
const SERVER_ORDER = [STRIPE, AIRBNB, LYFT, DRAFT] as const;

const refreshed = (): FakeReply => ({ status: 200, data: tokens(1) });
const listOf = (...items: ReturnType<typeof applicationRecord>[]) => (): FakeReply => ({ status: 200, data: { items, total: items.length } });

/** More than one page of applications, numbered in the server's order. */
const MANY = Array.from({ length: APPLICATIONS_PAGE_SIZE + 10 }, (_, i) =>
  applicationRecord({ id: `app-${i}`, company_name: `Company ${i}` }),
);

/** Answers each request with the page its offset asks for. */
function pageOf(items: readonly ReturnType<typeof applicationRecord>[], params: FakeParams): FakeReply {
  const offset = Number(params.offset ?? 0);
  const limit = Number(params.limit ?? APPLICATIONS_PAGE_SIZE);
  return { status: 200, data: { items: items.slice(offset, offset + limit), total: items.length } };
}

function loadedIds(): string[] {
  return (screen.getByTestId("applications-list").props.data as { id: string }[]).map(({ id }) => id);
}

async function scrollToEnd(): Promise<void> {
  await act(async () => {
    screen.getByTestId("applications-list").props.onEndReached();
  });
}

const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);

async function showScreen(): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <ApplicationsScreen />
      </ToastProvider>
    </Provider>,
  );
}

function rowNames(): string[] {
  return screen.getAllByRole("link").map((row) => String(row.props.accessibilityLabel));
}

function companies(): string[] {
  return rowNames().map((name) => name.split(",")[0]);
}

const SHEET_ROW_HEIGHT = 56;
const SHEET_HEIGHT = 800;

async function scrollSheetToEnd(): Promise<void> {
  const rows = screen.getAllByRole("radio");
  let sheet = rows[0].parent;
  while (sheet && !sheet.props.onScroll) sheet = sheet.parent;
  if (!sheet) throw new Error("The sort sheet has no scrolling list");
  const contentHeight = SHEET_ROW_HEIGHT * APPLICATION_SORT_KEYS.length;
  for (const [index, row] of rows.entries()) {
    await fireEvent(row, "layout", { nativeEvent: { layout: { x: 0, y: index * SHEET_ROW_HEIGHT, width: 400, height: SHEET_ROW_HEIGHT } } });
  }
  await fireEvent(sheet, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: SHEET_HEIGHT } } });
  await fireEvent(sheet, "contentSizeChange", 400, contentHeight);
  await fireEvent.scroll(sheet, {
    nativeEvent: {
      contentOffset: { x: 0, y: contentHeight - SHEET_HEIGHT },
      contentSize: { height: contentHeight, width: 400 },
      layoutMeasurement: { height: SHEET_HEIGHT, width: 400 },
    },
  });
}

async function sortBy(current: string, next: string): Promise<void> {
  await fireEvent.press(screen.getByRole("button", { name: `Sort: ${current}` }));
  // The sheet is a list that renders rows as they scroll into view, as on a phone, so lay it
  // out and scroll it to the end.
  if (!screen.queryByRole("radio", { name: next })) await scrollSheetToEnd();
  await fireEvent.press(await screen.findByRole("radio", { name: next }));
}

async function pullToRefresh(): Promise<void> {
  await act(async () => {
    await screen.getByTestId("applications-list").props.refreshControl.props.onRefresh();
  });
}

beforeEach(() => {
  storedItems.clear();
  storeSession();
  openURL.mockClear();
  store.dispatch(baseApi.util.resetApiState());
});

it("opens the Applications tab on a skeleton of the rows while the list loads, then shows every application with what the website's table shows", async () => {
  let answer: (reply: FakeReply) => void = () => undefined;
  serve({
    "POST /auth/mobile/refresh": refreshed,
    "GET /applications": () => new Promise<FakeReply>((resolve) => (answer = resolve)),
  });
  await renderApp("/applications");

  expect(await screen.findByLabelText(APPLICATION_MESSAGES.loadingList)).toBeTruthy();
  expect(screen.getAllByTestId("application-skeleton-row").length).toBeGreaterThan(0);
  // Stand-ins for the Add and Sort buttons, so the rows don't jump down when they arrive.
  expect(screen.getByTestId("applications-header-skeleton")).toBeTruthy();

  await act(async () => answer(listOf(...SERVER_ORDER)()));

  expect(await screen.findByText("Stripe")).toBeTruthy();
  expect(screen.queryByLabelText(APPLICATION_MESSAGES.loadingList)).toBeNull();
  expect(screen.getByText("Staff Engineer")).toBeTruthy();
  expect(screen.getByText("Interview scheduled")).toBeTruthy();
  expect(screen.getByText("85% fit")).toBeTruthy();
  expect(screen.getByText(`Seattle, WA · Hybrid · Applied ${new Date(STRIPE.applied_at ?? "").toLocaleDateString()}`)).toBeTruthy();
  expect(screen.getByText("92.50% fit")).toBeTruthy();
  // Nothing to say about a draft beyond its company and role, so it says nothing more.
  expect(screen.getByRole("link", { name: "Zillow, Engineer" })).toBeTruthy();
  expect(companies()).toEqual(["Stripe", "Airbnb", "Lyft", "Zillow"]);
});

it("opens an application's own screen when its row is pressed", async () => {
  serve({
    "POST /auth/mobile/refresh": refreshed,
    "GET /applications": listOf(STRIPE, AIRBNB),
    "GET /applications/app-airbnb": () => ({ status: 200, data: applicationDetailRecord({ id: "app-airbnb", role_title: "Senior Engineer" }) }),
  });
  await renderApp("/applications");

  await fireEvent.press(await screen.findByRole("link", { name: /^Airbnb, Senior Engineer/ }));

  expect(screen).toHavePathname("/applications/app-airbnb");
  expect(await screen.findByRole("header", { name: "Senior Engineer" })).toBeTruthy();
  expect(openURL).not.toHaveBeenCalled();
});

it("opens asking the server for its default order, applied most recently first, a page at a time", async () => {
  const sent = serve({ "GET /applications": listOf(...SERVER_ORDER) });
  await showScreen();
  await screen.findByText("Stripe");

  expect(sent.filter(({ route }) => route === "GET /applications").map(({ params }) => params)).toEqual([
    { sort: "applied", order: "desc", limit: APPLICATIONS_PAGE_SIZE, offset: 0 },
  ]);
});

it("sorts by any of the website's columns, either way, on the server, showing rows in the order it sends", async () => {
  // The fake server puts the list backwards for ascending sorts, so the screen must follow it.
  const sent = serve({
    "GET /applications": (_body, params) =>
      listOf(...(params.order === "asc" ? [...SERVER_ORDER].reverse() : SERVER_ORDER))(),
  });
  await showScreen();
  await screen.findByText("Stripe");

  let current = APPLICATION_SORTS["applied-desc"].label;
  for (const key of APPLICATION_SORT_KEYS.filter((k) => k !== "applied-desc")) {
    const next = APPLICATION_SORTS[key];
    await sortBy(current, next.label);
    current = next.label;
    await waitFor(() => expect(screen.getByRole("button", { name: `Sort: ${current}` })).toBeTruthy());
    expect(sent.at(-1)?.params).toEqual({ sort: next.field, order: next.direction, limit: APPLICATIONS_PAGE_SIZE, offset: 0 });
    expect(companies()).toEqual(next.direction === "asc" ? ["Zillow", "Lyft", "Airbnb", "Stripe"] : ["Stripe", "Airbnb", "Lyft", "Zillow"]);
  }
});

it("shows the skeleton while a new sort loads, rather than the old order", async () => {
  let answer: (reply: FakeReply) => void = () => undefined;
  serve({
    "GET /applications": (_body, params) =>
      params.sort === "company" ? new Promise<FakeReply>((resolve) => (answer = resolve)) : listOf(...SERVER_ORDER)(),
  });
  await showScreen();
  await screen.findByText("Stripe");

  await sortBy("Applied, newest first", "Company, A to Z");

  expect(await screen.findByLabelText(APPLICATION_MESSAGES.loadingList)).toBeTruthy();
  expect(screen.queryByText("Stripe")).toBeNull();
  await act(async () => answer(listOf(AIRBNB, LYFT)()));
  expect(await screen.findByText("Airbnb")).toBeTruthy();
  expect(companies()).toEqual(["Airbnb", "Lyft"]);
});

it("loads the next page when the list is scrolled to the end, with skeleton rows under it meanwhile", async () => {
  let answer: (reply: FakeReply) => void = () => undefined;
  const sent = serve({
    "GET /applications": (_body, params) =>
      Number(params.offset) === 0 ? pageOf(MANY, params) : new Promise<FakeReply>((resolve) => (answer = () => resolve(pageOf(MANY, params)))),
  });
  await showScreen();
  await screen.findByText("Company 0");
  expect(loadedIds()).toHaveLength(APPLICATIONS_PAGE_SIZE);
  expect(screen.queryByLabelText(APPLICATION_MESSAGES.loadingMore)).toBeNull();

  await scrollToEnd();

  expect(await screen.findByLabelText(APPLICATION_MESSAGES.loadingMore)).toBeTruthy();
  expect(screen.getByTestId("applications-footer-skeleton")).toBeTruthy();
  expect(sent.at(-1)?.params).toEqual({ sort: "applied", order: "desc", limit: APPLICATIONS_PAGE_SIZE, offset: APPLICATIONS_PAGE_SIZE });

  await act(async () => answer({ status: 200 }));

  await waitFor(() => expect(loadedIds()).toEqual(MANY.map(({ id }) => id)));
  expect(screen.queryByLabelText(APPLICATION_MESSAGES.loadingMore)).toBeNull();

  // Everything is loaded, so reaching the end again asks for nothing.
  const requests = sent.length;
  await scrollToEnd();
  expect(sent).toHaveLength(requests);
});

it("keeps the rows it has when the next page fails, and loads it on Try again", async () => {
  let failNextPage = true;
  const sent = serve({
    "GET /applications": (_body, params) =>
      Number(params.offset) > 0 && failNextPage ? { status: 503, data: { detail: "down" } } : pageOf(MANY, params),
  });
  await showScreen();
  await screen.findByText("Company 0");

  await scrollToEnd();

  expect(await screen.findByText(APPLICATION_MESSAGES.couldntLoadMore)).toBeTruthy();
  expect(loadedIds()).toHaveLength(APPLICATIONS_PAGE_SIZE);
  expect(screen.getByText("Company 0")).toBeTruthy();
  // The rows aren't stale, just not all there, so no "last loaded" banner.
  expect(screen.queryByText(SHOWING_LAST_LOADED_MESSAGE)).toBeNull();

  // Scrolling on doesn't hammer a failing server; Try again is the way back.
  const requests = sent.length;
  await scrollToEnd();
  expect(sent).toHaveLength(requests);

  failNextPage = false;
  await fireEvent.press(screen.getByRole("button", { name: APPLICATION_MESSAGES.tryAgain }));

  await waitFor(() => expect(loadedIds()).toHaveLength(MANY.length));
  expect(screen.queryByText(APPLICATION_MESSAGES.couldntLoadMore)).toBeNull();
});

it("opens the add screen from the list, on the phone rather than the website", async () => {
  serve({
    "POST /auth/mobile/refresh": refreshed,
    "GET /applications": listOf(STRIPE),
    "GET /companies": () => ({ status: 200, data: { items: [], total: 0 } }),
  });
  await renderApp("/applications");
  await fireEvent.press(await screen.findByRole("button", { name: APPLICATION_MESSAGES.add }));

  expect(screen).toHavePathname("/applications/new");
  expect(await screen.findByTestId("add-application")).toBeTruthy();
  expect(openURL).not.toHaveBeenCalled();
});

it("clears a failed next page once any later load works, a refresh or an edit elsewhere", async () => {
  let failNextPage = true;
  serve({
    "GET /applications": (_body, params) =>
      Number(params.offset) > 0 && failNextPage ? { status: 503, data: { detail: "down" } } : pageOf(MANY, params),
  });
  await showScreen();
  await screen.findByText("Company 0");

  // Something else changed an application, so the list reloads in the background.
  await scrollToEnd();
  expect(await screen.findByText(APPLICATION_MESSAGES.couldntLoadMore)).toBeTruthy();
  await act(async () => {
    store.dispatch(applicationsApi.util.invalidateTags([{ type: "Applications", id: "LIST" }]));
  });
  await waitFor(() => expect(screen.queryByText(APPLICATION_MESSAGES.couldntLoadMore)).toBeNull());
  expect(loadedIds()).toHaveLength(APPLICATIONS_PAGE_SIZE);

  // A pull to refresh clears it too.
  await scrollToEnd();
  expect(await screen.findByText(APPLICATION_MESSAGES.couldntLoadMore)).toBeTruthy();
  await pullToRefresh();
  await waitFor(() => expect(screen.queryByText(APPLICATION_MESSAGES.couldntLoadMore)).toBeNull());

  // And with the error gone, reaching the end loads the next page again.
  failNextPage = false;
  await scrollToEnd();
  await waitFor(() => expect(loadedIds()).toHaveLength(MANY.length));
});

it("doesn't ask for the next page while the list is reloading", async () => {
  let answer: (reply: FakeReply) => void = () => undefined;
  let holdFirstPage = false;
  const sent = serve({
    "GET /applications": (_body, params) =>
      holdFirstPage && Number(params.offset) === 0
        ? new Promise<FakeReply>((resolve) => (answer = () => resolve(pageOf(MANY, params))))
        : pageOf(MANY, params),
  });
  await showScreen();
  await screen.findByText("Company 0");

  holdFirstPage = true;
  await act(async () => {
    store.dispatch(applicationsApi.util.invalidateTags([{ type: "Applications", id: "LIST" }]));
  });
  await waitFor(() => expect(sent.filter(({ route }) => route === "GET /applications")).toHaveLength(2));
  await scrollToEnd();
  expect(sent.filter(({ route }) => route === "GET /applications")).toHaveLength(2);

  await act(async () => answer({ status: 200 }));
  await scrollToEnd();
  await waitFor(() => expect(loadedIds()).toHaveLength(MANY.length));
  expect(sent.at(-1)?.params).toMatchObject({ offset: APPLICATIONS_PAGE_SIZE });
});

it("says when there are no applications yet, and offers to add one", async () => {
  serve({ "GET /applications": listOf() });
  await showScreen();

  expect(await screen.findByRole("header", { name: APPLICATION_MESSAGES.noneHeading })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Sort:/ })).toBeNull();
  expect(screen.getByRole("button", { name: APPLICATION_MESSAGES.add })).toBeTruthy();
  expect(openURL).not.toHaveBeenCalled();
});

it("says when the list couldn't load, and loads it on Try again", async () => {
  let reply: FakeReply = { status: 500, data: { detail: "boom" } };
  serve({ "GET /applications": () => reply });
  await showScreen();

  expect(await screen.findByRole("header", { name: APPLICATION_MESSAGES.couldntLoadList })).toBeTruthy();

  reply = listOf(STRIPE)();
  await fireEvent.press(screen.getByRole("button", { name: APPLICATION_MESSAGES.tryAgain }));

  expect(await screen.findByText("Stripe")).toBeTruthy();
  expect(screen.queryByRole("header", { name: APPLICATION_MESSAGES.couldntLoadList })).toBeNull();
});

it("refreshes on pull, and keeps what it last loaded when the refresh fails", async () => {
  let reply: FakeReply = listOf(STRIPE)();
  serve({ "GET /applications": () => reply });
  await showScreen();
  await screen.findByText("Stripe");

  reply = listOf(STRIPE, AIRBNB)();
  await pullToRefresh();
  expect(await screen.findByText("Airbnb")).toBeTruthy();

  reply = { status: 503, data: { detail: "down" } };
  await pullToRefresh();
  await waitFor(() => expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy());
  expect(screen.getByText("Stripe")).toBeTruthy();
  expect(screen.getByText("Airbnb")).toBeTruthy();
});

it("keeps saying there are no applications when a refresh of the empty list fails, rather than that it couldn't load", async () => {
  let reply: FakeReply = listOf()();
  serve({ "GET /applications": () => reply });
  await showScreen();
  await screen.findByRole("header", { name: APPLICATION_MESSAGES.noneHeading });

  reply = { status: 503, data: { detail: "down" } };
  await pullToRefresh();

  await waitFor(() => expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy());
  expect(screen.getByRole("header", { name: APPLICATION_MESSAGES.noneHeading })).toBeTruthy();
  expect(screen.queryByRole("header", { name: APPLICATION_MESSAGES.couldntLoadList })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Sort:/ })).toBeNull();
});
