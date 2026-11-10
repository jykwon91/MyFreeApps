import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE, ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { Provider } from "react-redux";
import { WEB_BASE_URL } from "../src/constants/api";
import { APPLICATION_MESSAGES } from "../src/constants/applications";
import ApplicationsScreen from "../src/features/applications/ApplicationsScreen";
import { store } from "../src/lib/store";
import { applicationRecord } from "../test-support/applicationRecord";
import { serve } from "../test-support/fakeServer";
import { storedItems } from "../test-support/memorySecureStore";
import { renderApp } from "../test-support/renderApp";
import { storeSession, tokens } from "../test-support/storedSession";
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
// Not the order the list shows, so a list that just kept it would fail.
const UNSORTED = [DRAFT, LYFT, AIRBNB, STRIPE] as const;

const refreshed = (): FakeReply => ({ status: 200, data: tokens(1) });
const listOf = (...items: ReturnType<typeof applicationRecord>[]) => (): FakeReply => ({ status: 200, data: { items, total: items.length } });

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

async function sortBy(current: string, next: string): Promise<void> {
  await fireEvent.press(screen.getByRole("button", { name: `Sort: ${current}` }));
  await fireEvent.press(screen.getByRole("radio", { name: next }));
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

  await act(async () => answer(listOf(...UNSORTED)()));

  expect(await screen.findByText("Stripe")).toBeTruthy();
  expect(screen.queryByLabelText(APPLICATION_MESSAGES.loadingList)).toBeNull();
  expect(screen.getByText("Staff Engineer")).toBeTruthy();
  expect(screen.getByText("Interview scheduled")).toBeTruthy();
  expect(screen.getByText("85% fit")).toBeTruthy();
  expect(screen.getByText(`Seattle, WA · Hybrid · Applied ${new Date(STRIPE.applied_at ?? "").toLocaleDateString()}`)).toBeTruthy();
  expect(screen.getByText("92.50% fit")).toBeTruthy();
  // Nothing to say about a draft beyond its company and role, so it says nothing more.
  expect(screen.getByRole("link", { name: "Zillow, Engineer" })).toBeTruthy();
  // Applied most recently first, not yet applied last, whatever order the server sent.
  expect(companies()).toEqual(["Stripe", "Airbnb", "Lyft", "Zillow"]);
});

it("opens an application on the website when its row is pressed", async () => {
  serve({ "GET /applications": listOf(STRIPE, AIRBNB) });
  await showScreen();

  await fireEvent.press(await screen.findByRole("link", { name: /^Airbnb, Senior Engineer/ }));

  expect(openURL).toHaveBeenLastCalledWith(`${WEB_BASE_URL}/applications/app-airbnb`);
});

it("sorts by any of the website's columns, either way, keeping rows without the value last", async () => {
  serve({ "GET /applications": listOf(...UNSORTED) });
  await showScreen();
  await screen.findByText("Stripe");
  expect(companies()).toEqual(["Stripe", "Airbnb", "Lyft", "Zillow"]);

  await sortBy("Applied, newest first", "Company, A to Z");
  expect(companies()).toEqual(["Airbnb", "Lyft", "Stripe", "Zillow"]);

  // As numbers, so 100 beats 92.50.
  await sortBy("Company, A to Z", "Fit, highest first");
  expect(companies()).toEqual(["Lyft", "Airbnb", "Stripe", "Zillow"]);

  await sortBy("Fit, highest first", "Fit, lowest first");
  expect(companies()).toEqual(["Stripe", "Airbnb", "Lyft", "Zillow"]);

  // Pipeline order, not the alphabet: applied, interviewing, offer.
  await sortBy("Fit, lowest first", "Status, in pipeline order");
  expect(companies()).toEqual(["Airbnb", "Stripe", "Lyft", "Zillow"]);

  await sortBy("Status, in pipeline order", "Status, reverse pipeline order");
  expect(companies()).toEqual(["Lyft", "Stripe", "Airbnb", "Zillow"]);
});

it("sends adding an application to the website from the list, since adding needs its job-link reader", async () => {
  serve({ "GET /applications": listOf(STRIPE) });
  await showScreen();
  await fireEvent.press(await screen.findByRole("button", { name: APPLICATION_MESSAGES.addOnWebsite }));
  expect(openURL).toHaveBeenLastCalledWith(`${WEB_BASE_URL}/applications`);
});

it("says when there are no applications yet, and offers to add one", async () => {
  serve({ "GET /applications": listOf() });
  await showScreen();

  expect(await screen.findByRole("header", { name: APPLICATION_MESSAGES.noneHeading })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Sort:/ })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: APPLICATION_MESSAGES.addOnWebsite }));
  expect(openURL).toHaveBeenLastCalledWith(`${WEB_BASE_URL}/applications`);
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
