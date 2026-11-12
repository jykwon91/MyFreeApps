import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { AppState, FlatList, Linking } from "react-native";
import type { AppStateStatus } from "react-native";
import { ANALYZE_MESSAGES } from "../src/constants/analyze";
import { APPLICATION_DETAIL_MESSAGES as DETAIL } from "../src/constants/applicationDetail";
import { DASHBOARD_FOLDS_KEY, DASHBOARD_MESSAGES as MESSAGES, STAGE_SCROLL_RETRY_LIMIT, STAGE_SCROLL_RETRY_MS } from "../src/constants/dashboard";
import { store } from "../src/lib/store";
import { applicationDetailRecord } from "../test-support/applicationDetailRecord";
import { applicationDetailRoutes } from "../test-support/applicationDetailRoutes";
import { daysAgo } from "../test-support/daysAgo";
import { eventRecord } from "../test-support/eventRecord";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { kanbanRecord } from "../test-support/kanbanRecord";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { renderApp } from "../test-support/renderApp";
import { storeSession, tokens } from "@platform/mobile/test-support/storedSession";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => "move-key-1") }));

const BOARD = "GET /applications?view=kanban";
const MOVE_STRIPE = "POST /applications/app-stripe/transitions";

const STRIPE = kanbanRecord({
  id: "app-stripe",
  role_title: "Staff Engineer",
  company_name: "Stripe",
  company_logo_url: "https://logo.example.com/stripe.png",
  latest_event_type: "applied",
  verdict: "strong_fit",
  stage_entered_at: daysAgo(15),
});
const AIRBNB = kanbanRecord({
  id: "app-airbnb",
  role_title: "Senior Engineer",
  company_name: "Airbnb",
  company_logo_url: "javascript:alert(1)",
  latest_event_type: "applied",
  verdict: "stretch",
  stage_entered_at: daysAgo(3),
});
const LYFT = kanbanRecord({
  id: "app-lyft",
  role_title: "Principal Engineer",
  company_name: "Lyft",
  latest_event_type: "interview_scheduled",
  stage_entered_at: daysAgo(7),
});
const ZILLOW = kanbanRecord({
  id: "app-zillow",
  role_title: "Engineer",
  company_name: "Zillow",
  latest_event_type: "rejected",
  verdict: "mismatch",
  stage_entered_at: daysAgo(30),
});
const ITEMS = [STRIPE, AIRBNB, LYFT, ZILLOW];

const refreshed = (): FakeReply => ({ status: 200, data: tokens(1) });
const boardOf = (...items: ReturnType<typeof kanbanRecord>[]) => (): FakeReply => ({ status: 200, data: { items, total: items.length } });

const ROW_WIDTH = 400;
const ROW_HEIGHT = 60;
const TALL_SCREEN = 10000;
/** Long enough for the list's batched drawing of more rows to run. */
const ROW_BATCH_MS = 1000;

const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
const scrollToIndex = jest.spyOn(FlatList.prototype, "scrollToIndex");
const scrollToOffset = jest.spyOn(FlatList.prototype, "scrollToOffset");
const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
// The store tells the API layer when the app comes back to the foreground, through the listener it adds as it loads.
const changeAppState = jest.mocked(AppState.addEventListener).mock.calls.find(([type]) => type === "change")?.[1] as (state: AppStateStatus) => void;

/** Closed's heading, which says whether it's open: its tile has the same name. */
function closedHeading() {
  return screen.getAllByRole("button", { name: /^Closed, / }).find((each) => each.props.accessibilityState?.expanded !== undefined);
}

function storedFolds(): unknown {
  const raw = storedItems.get(DASHBOARD_FOLDS_KEY);
  return raw === undefined ? undefined : JSON.parse(raw);
}

function card(name: RegExp) {
  return screen.getByRole("link", { name });
}

function measurableRows() {
  return screen.getByTestId("dashboard-list").queryAll((node) => typeof node.props.onLayout === "function");
}

// The list draws only a first screenful until its rows are measured. This gives it a phone tall enough for
// the whole board and measures every row it has drawn, until it has drawn them all.
async function showWholeBoard(): Promise<void> {
  const list = screen.getByTestId("dashboard-list");
  await fireEvent(list, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: ROW_WIDTH, height: TALL_SCREEN } } });
  let measured = -1;
  for (let rows = measurableRows(); rows.length !== measured; ) {
    measured = rows.length;
    for (const [index, row] of rows.entries()) {
      await fireEvent(row, "layout", { nativeEvent: { layout: { x: 0, y: index * ROW_HEIGHT, width: ROW_WIDTH, height: ROW_HEIGHT } } });
    }
    await fireEvent(list, "contentSizeChange", ROW_WIDTH, rows.length * ROW_HEIGHT);
    await fireEvent.scroll(list, {
      nativeEvent: {
        contentOffset: { x: 0, y: 0 },
        contentSize: { width: ROW_WIDTH, height: rows.length * ROW_HEIGHT },
        layoutMeasurement: { width: ROW_WIDTH, height: TALL_SCREEN },
      },
    });
    await act(async () => {
      jest.advanceTimersByTime(ROW_BATCH_MS);
    });
    rows = measurableRows();
  }
}

async function showBoard(): Promise<void> {
  await screen.findByRole("header", { name: MESSAGES.summaryTitle });
  await showWholeBoard();
}

async function pullToRefresh(): Promise<void> {
  await act(async () => {
    await screen.getByTestId("dashboard-list").props.refreshControl.props.onRefresh();
  });
}

beforeEach(() => {
  storedItems.clear();
  storeSession();
  jest.clearAllMocks();
  scrollToIndex.mockImplementation(() => undefined);
  scrollToOffset.mockImplementation(() => undefined);
  store.dispatch(baseApi.util.resetApiState());
});

it("opens on a skeleton of the summary, its four stage tiles and the stages while the board loads", async () => {
  let answer: (reply: FakeReply) => void = () => undefined;
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: () => new Promise<FakeReply>((resolve) => (answer = resolve)) });
  await renderApp();

  expect(await screen.findByLabelText(MESSAGES.loading)).toBeTruthy();
  expect(screen.getByTestId("dashboard-summary-skeleton")).toBeTruthy();
  // The same four tiles the summary shows, so nothing jumps when it arrives.
  expect(screen.getAllByTestId("stage-tile-skeleton")).toHaveLength(4);
  expect(screen.getAllByTestId("stage-skeleton").length).toBeGreaterThan(0);

  await act(async () => answer(boardOf(...ITEMS)()));

  expect(await screen.findByRole("header", { name: MESSAGES.summaryTitle })).toBeTruthy();
  expect(screen.queryByTestId("dashboard-skeleton")).toBeNull();
});

it("sums the board up: how many applications, and a tile per stage with its count", async () => {
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: boardOf(...ITEMS) });
  await renderApp();

  expect(await screen.findByText(`4 applications ${MESSAGES.onYourBoard}`)).toBeTruthy();
  await showWholeBoard();
  expect(screen.getByRole("button", { name: "Applied, 2 applications" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Interviewing, 1 application" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Offer, 0 applications" })).toBeTruthy();
  // The closed stage's heading also says its count while it's folded away.
  expect(screen.getAllByRole("button", { name: "Closed, 1 application" })).toHaveLength(2);
});

it("scrolls to a stage's heading when its tile is tapped", async () => {
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: boardOf(...ITEMS) });
  await renderApp();
  await showBoard();

  await fireEvent.press(screen.getByTestId("stage-tile-interviewing"));
  // Applied's heading, its two lanes and their cards come first.
  expect(scrollToIndex).toHaveBeenCalledTimes(1);
  expect(scrollToIndex).toHaveBeenLastCalledWith(expect.objectContaining({ index: 5, viewPosition: 0 }));

  // Each tap scrolls, even to the same stage again.
  await fireEvent.press(screen.getByTestId("stage-tile-interviewing"));
  expect(scrollToIndex).toHaveBeenCalledTimes(2);
});

it("opens Closed before scrolling to it, so its cards are there to scroll to", async () => {
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: boardOf(...ITEMS) });
  await renderApp();
  await showBoard();
  const openWhenScrolled: (boolean | undefined)[] = [];
  scrollToIndex.mockImplementation(() => {
    openWhenScrolled.push(closedHeading()?.props.accessibilityState?.expanded);
  });

  await fireEvent.press(screen.getByTestId("stage-tile-closed"));

  expect(openWhenScrolled).toEqual([true]);
  await showWholeBoard();
  expect(card(/^Engineer, Zillow/)).toBeTruthy();
});

it("jumps near a stage the list hasn't drawn yet, past the summary, then scrolls to it once the rows are drawn", async () => {
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: boardOf(...ITEMS) });
  await renderApp();
  await showBoard();
  await fireEvent(screen.getByTestId("dashboard-header"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: ROW_WIDTH, height: 200 } } });
  let failures = 1;
  scrollToIndex.mockImplementation(function (this: FlatList<unknown>, { index }: { index: number }) {
    if (failures === 0) return;
    failures -= 1;
    this.props.onScrollToIndexFailed?.({ index, highestMeasuredFrameIndex: 0, averageItemLength: 50 });
  });

  await fireEvent.press(screen.getByTestId("stage-tile-offer"));

  // Offer's heading is row 10, after Applied's and Interviewing's five each: the summary's 200 points, then 10 rows of about 50.
  expect(scrollToOffset).toHaveBeenLastCalledWith({ offset: 200 + 10 * 50, animated: false });
  expect(scrollToIndex).toHaveBeenCalledTimes(1);
  await act(async () => {
    jest.advanceTimersByTime(STAGE_SCROLL_RETRY_MS);
  });
  expect(scrollToIndex).toHaveBeenCalledTimes(2);
  expect(scrollToIndex).toHaveBeenLastCalledWith(expect.objectContaining({ index: 10, viewPosition: 0 }));
});

it("stops trying to scroll to a stage after a few tries", async () => {
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: boardOf(...ITEMS) });
  await renderApp();
  await showBoard();
  scrollToIndex.mockImplementation(function (this: FlatList<unknown>, { index }: { index: number }) {
    this.props.onScrollToIndexFailed?.({ index, highestMeasuredFrameIndex: 0, averageItemLength: 50 });
  });

  await fireEvent.press(screen.getByTestId("stage-tile-offer"));
  await act(async () => {
    jest.advanceTimersByTime(STAGE_SCROLL_RETRY_MS * (STAGE_SCROLL_RETRY_LIMIT + 2));
  });

  expect(scrollToIndex).toHaveBeenCalledTimes(1 + STAGE_SCROLL_RETRY_LIMIT);
});

it("folds Closed away, as the website's accordion does, and opens it from its heading", async () => {
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: boardOf(...ITEMS) });
  await renderApp();
  await showBoard();

  const closed = closedHeading();
  expect(closed?.props.accessibilityState).toEqual({ expanded: false });
  expect(screen.queryByRole("link", { name: /^Engineer, Zillow/ })).toBeNull();

  await fireEvent.press(closed!);
  await showWholeBoard();
  expect(screen.getByRole("link", { name: /^Engineer, Zillow/ })).toBeTruthy();

  const open = closedHeading();
  expect(open?.props.accessibilityState).toEqual({ expanded: true });
  await fireEvent.press(open!);
  expect(screen.queryByRole("link", { name: /^Engineer, Zillow/ })).toBeNull();
});

it("splits each stage into the Strong fit and Everything else lanes, with counts, and folds a lane in every stage", async () => {
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: boardOf(...ITEMS) });
  await renderApp();
  await showBoard();

  // Applied has one of each. Interviewing has none that fit strongly, and Offer has nothing at all,
  // so as on the website each shows both lanes, with None in each empty one.
  expect(screen.getAllByRole("button", { name: "Strong fit, 1 application" })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Strong fit, 0 applications" })).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "Everything else, 1 application" })).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "Everything else, 0 applications" })).toHaveLength(1);
  expect(screen.getAllByText(MESSAGES.noneInLane)).toHaveLength(3);

  const strongFit = screen.getByRole("button", { name: "Strong fit, 1 application" });
  expect(strongFit.props.accessibilityState).toEqual({ expanded: true });
  expect(strongFit.props.accessibilityHint).toBe(MESSAGES.showsLane);
  await fireEvent.press(strongFit);

  expect(screen.queryByRole("link", { name: /^Staff Engineer, Stripe/ })).toBeNull();
  // Only Offer's empty Everything else lane is left saying None.
  expect(screen.getAllByText(MESSAGES.noneInLane)).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Strong fit, 1 application" }).props.accessibilityState).toEqual({ expanded: false });
  for (const lane of screen.getAllByRole("button", { name: "Strong fit, 0 applications" })) {
    expect(lane.props.accessibilityState).toEqual({ expanded: false });
  }
  expect(card(/^Senior Engineer, Airbnb/)).toBeTruthy();

  await fireEvent.press(screen.getByRole("button", { name: "Strong fit, 1 application" }));
  expect(card(/^Staff Engineer, Stripe/)).toBeTruthy();
});

it("keeps the folds for next time, and opens the board the way it was left", async () => {
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: boardOf(...ITEMS) });
  await renderApp();
  await showBoard();

  await fireEvent.press(screen.getByRole("button", { name: "Strong fit, 1 application" }));
  await fireEvent.press(closedHeading()!);
  await waitFor(() => expect(storedFolds()).toEqual({ collapsedLanes: ["strong_fit"], isClosedOpen: true }));

  await act(async () => screen.unmount());
  await renderApp();
  await showBoard();

  expect(closedHeading()?.props.accessibilityState).toEqual({ expanded: true });
  expect(card(/^Engineer, Zillow/)).toBeTruthy();
  expect(screen.queryByRole("link", { name: /^Staff Engineer, Stripe/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Strong fit, 1 application" }).props.accessibilityState).toEqual({ expanded: false });
});

it("opens the board the website's way when what the phone kept can't be read", async () => {
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: boardOf(...ITEMS) });
  const getItem = jest.spyOn(SecureStore, "getItemAsync");
  getItem.mockImplementation(async (key: string) => {
    if (key === DASHBOARD_FOLDS_KEY) throw new Error("keychain locked");
    return storedItems.get(key) ?? null;
  });
  try {
    await renderApp();
    await showBoard();
  } finally {
    getItem.mockRestore();
  }

  expect(closedHeading()?.props.accessibilityState).toEqual({ expanded: false });
  expect(card(/^Staff Engineer, Stripe/)).toBeTruthy();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("Couldn't read the board's folds"), expect.any(Error));
});

it("opens the board the website's way when what the phone kept isn't a set of folds", async () => {
  storedItems.set(DASHBOARD_FOLDS_KEY, JSON.stringify({ collapsedLanes: "strong_fit" }));
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: boardOf(...ITEMS) });
  await renderApp();
  await showBoard();

  expect(closedHeading()?.props.accessibilityState).toEqual({ expanded: false });
  expect(card(/^Staff Engineer, Stripe/)).toBeTruthy();
});

it("reloads the board when the app comes back to the foreground, so its stage ages are current", async () => {
  const sent = serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: boardOf(...ITEMS) });
  await renderApp();
  await showBoard();
  const loads = () => sent.filter(({ route }) => route === BOARD).length;
  expect(loads()).toBe(1);

  await act(async () => changeAppState("background"));
  await act(async () => changeAppState("active"));

  await waitFor(() => expect(loads()).toBe(2));
});

it("shows each card's role, company, verdict and, after a week, how long it has sat in its stage", async () => {
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: boardOf(...ITEMS) });
  await renderApp();
  await showBoard();
  await fireEvent.press(screen.getByTestId("stage-tile-closed"));
  await showWholeBoard();

  // Everything a card shows, read out in order.
  expect(card(/^Staff Engineer, Stripe/).props.accessibilityLabel).toBe("Staff Engineer, Stripe, Strong fit, 15 days in stage");
  expect(card(/^Senior Engineer, Airbnb/).props.accessibilityLabel).toBe("Senior Engineer, Airbnb, Stretch");
  expect(card(/^Principal Engineer, Lyft/).props.accessibilityLabel).toBe("Principal Engineer, Lyft, 7 days in stage");
  expect(card(/^Engineer, Zillow/).props.accessibilityLabel).toBe("Engineer, Zillow, Mismatch, 30 days in stage");
  expect(screen.getByText("15d in stage")).toBeTruthy();
  expect(screen.getByText("7d in stage")).toBeTruthy();
  expect(screen.getByText("30d in stage")).toBeTruthy();
  // Three days is too soon to flag.
  expect(screen.queryByText("3d in stage")).toBeNull();
  expect(screen.getByText("Stretch")).toBeTruthy();
  expect(screen.getByText("Mismatch")).toBeTruthy();
  expect(card(/^Staff Engineer, Stripe/).props.accessibilityHint).toBe(MESSAGES.opensApplication);
});

it("shows a company's logo only from a web address", async () => {
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: boardOf(STRIPE, AIRBNB) });
  await renderApp();
  await showBoard();

  const logos = screen.getAllByTestId("company-logo");
  expect(logos.map((logo) => logo.props.source)).toEqual([{ uri: "https://logo.example.com/stripe.png" }]);
  // Airbnb's isn't http or https, so it gets the plain circle.
  expect(screen.getAllByTestId("company-logo-placeholder")).toHaveLength(1);
});

it("opens an application's own screen on the phone when its card is tapped", async () => {
  const detail = applicationDetailRecord({ id: "app-stripe", role_title: "Staff Engineer" });
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: boardOf(STRIPE), ...applicationDetailRoutes(detail) });
  await renderApp();

  await fireEvent.press(await screen.findByRole("link", { name: /^Staff Engineer, Stripe/ }));

  expect(screen).toHavePathname("/applications/app-stripe");
  expect(await screen.findByRole("header", { name: "Staff Engineer" })).toBeTruthy();
  expect(openURL).not.toHaveBeenCalled();
});

it("moves a card to another stage at once, with a spinner on its Move button until the server agrees", async () => {
  let answer: (reply: FakeReply) => void = () => undefined;
  let board = boardOf(...ITEMS);
  const sent = serve({
    "POST /auth/mobile/refresh": refreshed,
    [BOARD]: () => board(),
    [MOVE_STRIPE]: () => new Promise<FakeReply>((resolve) => (answer = resolve)),
  });
  await renderApp();
  await showBoard();

  const move = screen.getByRole("button", { name: "Move Staff Engineer, Stripe" });
  expect(move.props.accessibilityHint).toBe(MESSAGES.moveHint);
  await fireEvent.press(move);
  expect(await screen.findByText(DETAIL.stageTitle)).toBeTruthy();
  await fireEvent.press(screen.getByRole("radio", { name: "Offer" }));
  await showWholeBoard();

  // The card moves before the server answers.
  expect(screen.getByRole("button", { name: "Offer, 1 application" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Applied, 1 application" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Move Staff Engineer, Stripe" }).props.accessibilityState).toEqual(expect.objectContaining({ busy: true }));
  expect(screen.getByText(DETAIL.moving)).toBeTruthy();

  // The server has it in Offer from now on, so reloading the board after the move keeps it there.
  board = boardOf({ ...STRIPE, latest_event_type: "offer_received" }, AIRBNB, LYFT, ZILLOW);
  await act(async () => answer({ status: 201, data: eventRecord({ id: "e-2", application_id: "app-stripe", event_type: "offer_received" }) }));

  expect(await screen.findByText("Moved to Offer.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Offer, 1 application" })).toBeTruthy();
  expect(sent.filter(({ route }) => route === MOVE_STRIPE).map(({ body }) => body)).toEqual([
    // A fresh key per move, as the website's board sends.
    { target_column: "offer", idempotency_key: "move-key-1" },
  ]);
});

it("puts a card back and says so when the server refuses the move", async () => {
  serve({
    "POST /auth/mobile/refresh": refreshed,
    [BOARD]: boardOf(...ITEMS),
    [MOVE_STRIPE]: () => ({ status: 400, data: { detail: "nope" } }),
  });
  await renderApp();
  await showBoard();

  await fireEvent.press(screen.getByRole("button", { name: "Move Staff Engineer, Stripe" }));
  await fireEvent.press(await screen.findByRole("radio", { name: "Interviewing" }));

  expect(await screen.findByText(DETAIL.couldntMove)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Applied, 2 applications" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Interviewing, 1 application" })).toBeTruthy();
});

it("doesn't ask the server to move a card to the stage it's already in", async () => {
  const sent = serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: boardOf(...ITEMS) });
  await renderApp();
  await showBoard();

  await fireEvent.press(screen.getByRole("button", { name: "Move Staff Engineer, Stripe" }));
  await fireEvent.press(await screen.findByRole("radio", { name: "Applied" }));

  expect(sent.some(({ route }) => route === MOVE_STRIPE)).toBe(false);
});

it("says when there are no applications yet, and opens the Analyze screen on the phone", async () => {
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: boardOf() });
  await renderApp();

  expect(await screen.findByRole("header", { name: MESSAGES.noneHeading })).toBeTruthy();
  expect(screen.getByText(MESSAGES.noneBody)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.analyze }));

  expect(screen).toHavePathname("/analyze");
  expect(await screen.findByLabelText(ANALYZE_MESSAGES.linkLabel)).toBeTruthy();
  expect(openURL).not.toHaveBeenCalled();
});

it("says when the board couldn't load, and loads it on Try again", async () => {
  let reply: FakeReply = { status: 500, data: { detail: "boom" } };
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: () => reply });
  await renderApp();

  expect(await screen.findByRole("header", { name: MESSAGES.couldntLoad })).toBeTruthy();
  expect(screen.getByText(MESSAGES.tryAgainOffer)).toBeTruthy();
  reply = { status: 200, data: { items: [STRIPE], total: 1 } };
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));

  expect(await screen.findByRole("link", { name: /^Staff Engineer, Stripe/ })).toBeTruthy();
  expect(screen.queryByRole("header", { name: MESSAGES.couldntLoad })).toBeNull();
});

it("refreshes on pull, and keeps the board it last loaded when the refresh fails", async () => {
  let reply: FakeReply = { status: 200, data: { items: [STRIPE], total: 1 } };
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: () => reply });
  await renderApp();
  await screen.findByRole("link", { name: /^Staff Engineer, Stripe/ });

  reply = { status: 200, data: { items: [STRIPE, LYFT], total: 2 } };
  await pullToRefresh();
  expect(await screen.findByRole("link", { name: /^Principal Engineer, Lyft/ })).toBeTruthy();
  expect(screen.queryByText(SHOWING_LAST_LOADED_MESSAGE)).toBeNull();

  reply = { status: 500, data: { detail: "boom" } };
  await pullToRefresh();
  expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
  expect(card(/^Staff Engineer, Stripe/)).toBeTruthy();
  expect(card(/^Principal Engineer, Lyft/)).toBeTruthy();
});

it("keeps saying there are no applications when a refresh of the empty board fails", async () => {
  let reply: FakeReply = { status: 200, data: { items: [], total: 0 } };
  serve({ "POST /auth/mobile/refresh": refreshed, [BOARD]: () => reply });
  await renderApp();
  await screen.findByRole("header", { name: MESSAGES.noneHeading });

  reply = { status: 500, data: { detail: "boom" } };
  await pullToRefresh();

  await waitFor(() => expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy());
  expect(screen.getByRole("header", { name: MESSAGES.noneHeading })).toBeTruthy();
  expect(screen.queryByRole("header", { name: MESSAGES.couldntLoad })).toBeNull();
});
