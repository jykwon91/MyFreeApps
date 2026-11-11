import { DISCOVER_ACTION_MESSAGES as ACTIONS, REFRESH_MESSAGES } from "@myjobhunter/api-client/constants/discoverMessages";
import { INBOX_POLL_INTERVAL_MS, SCORING_WINDOW_MS } from "@myjobhunter/api-client/constants/discoverScoring";
import type { DiscoveredJob } from "@myjobhunter/api-client/types/discovery/discovered-job";
import type { DiscoverySource } from "@myjobhunter/api-client/types/discovery/discovery-source";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, waitFor, within } from "@testing-library/react-native";
import { screen } from "expo-router/testing-library";
import { AccessibilityInfo, Alert } from "react-native";
import { DISCOVERED_JOB_MESSAGES as JOB } from "../src/constants/discoveredJob";
import { DISCOVER_SCREEN_MESSAGES as MESSAGES } from "../src/constants/discoverScreen";
import { SAVED_SEARCH_MESSAGES as SAVED } from "../src/constants/savedSearches";
import { SAVED_SEARCH_SHEET_MESSAGES as SHEET } from "../src/constants/savedSearchSheet";
import { store } from "../src/lib/store";
import { alertButton } from "../test-support/alertButton";
import { discoveredJobRecord } from "../test-support/discoveredJobRecord";
import { discoverRoutes } from "../test-support/discoverRoutes";
import { discoverySourceRecord } from "../test-support/discoverySourceRecord";
import { serve } from "../test-support/fakeServer";
import { storedItems } from "../test-support/memorySecureStore";
import { renderDiscover } from "../test-support/renderDiscover";
import { storeSession } from "../test-support/storedSession";
import type { FakeReply } from "../test-support/types/FakeReply";
import type { FakeRoute } from "../test-support/types/FakeRoute";
import type { SentRequest } from "../test-support/types/SentRequest";

jest.mock("expo-secure-store", () => jest.requireActual("../test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("../test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

const SOURCE = discoverySourceRecord({ id: "src-1", name: "Backend roles", last_fetched_at: "2026-11-10T00:00:00Z" });
const FETCHED: FakeReply = {
  status: 200,
  data: { fetch_id: "f1", status: "success", fetched_count: 12, new_count: 3, updated_count: 0, duration_ms: 900, error_message: null },
};
const name = (action: string) => SAVED.actionFor(action, "Backend roles");
const toastText = async (): Promise<string> => String(within(await screen.findByTestId("toast")).getByRole("alert").props.children);
const requests = (sent: SentRequest[], route: string) => sent.filter((request) => request.route === route);

/** Discovery over saved searches the server changes as it would, plus any overrides. */
function serveSources(overrides: Record<string, FakeRoute> = {}, jobs: () => readonly DiscoveredJob[] = () => []): SentRequest[] {
  let sources: DiscoverySource[] = [SOURCE];
  return serve({
    ...discoverRoutes([], []),
    "GET /discover/sources": () => ({ status: 200, data: sources }),
    "GET /discover": (body, params) => discoverRoutes(sources, jobs())["GET /discover"](body, params),
    "PATCH /discover/sources/src-1": (body) => {
      sources = sources.map((source) => (source.id === "src-1" ? { ...source, ...body } : source));
      return { status: 200, data: sources[0] };
    },
    "DELETE /discover/sources/src-1": () => {
      sources = [];
      return { status: 204 };
    },
    "POST /discover/sources/src-1/refresh": () => FETCHED,
    ...overrides,
  });
}

async function showRow(): Promise<void> {
  await renderDiscover();
  await screen.findByTestId("saved-search-src-1");
}

// After the shared teardown has run out a fake clock's timers (see flushTimersAfterEach).
afterEach(() => jest.useRealTimers());

// The shared store's queries hold RTK Query's timer for dropping unused data (60s), which would
// keep Jest from exiting; resetting the store clears it.
afterAll(() => store.dispatch(baseApi.util.resetApiState()));

beforeEach(() => {
  storedItems.clear();
  storeSession();
  jest.clearAllMocks();
  store.dispatch(baseApi.util.resetApiState());
});

describe("refreshing a saved search", () => {
  it("shows Fetching… from the press, then says what it fetched", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    const sent = serveSources({ "POST /discover/sources/src-1/refresh": () => new Promise<FakeReply>((resolve) => (answer = resolve)) });
    await showRow();

    await fireEvent.press(screen.getByRole("button", { name: name(SAVED.refresh) }));

    expect(await screen.findByText(SAVED.refreshing)).toBeTruthy();
    await act(async () => answer(FETCHED));
    expect(await toastText()).toBe(REFRESH_MESSAGES.fetched(12, 3));
    expect(requests(sent, "POST /discover/sources/src-1/refresh")).toHaveLength(1);
  });

  it("says it's been refreshed a lot when the phone hits the refresh limit", async () => {
    serveSources({ "POST /discover/sources/src-1/refresh": () => ({ status: 429, data: { detail: "Too many attempts" } }) });
    await showRow();

    await fireEvent.press(screen.getByRole("button", { name: name(SAVED.refresh) }));

    expect(await toastText()).toBe(REFRESH_MESSAGES.rateLimited);
    expect(REFRESH_MESSAGES.rateLimited).toBe("You've refreshed a lot — try again in a few minutes");
  });

  it("passes on what the job board's own quota says, and says it failed otherwise", async () => {
    let reply: FakeReply = { status: 429, data: { detail: "JSearch monthly quota reached; resets on the 1st" } };
    serveSources({ "POST /discover/sources/src-1/refresh": () => reply });
    await showRow();

    await fireEvent.press(screen.getByRole("button", { name: name(SAVED.refresh) }));
    expect(await toastText()).toBe("JSearch monthly quota reached; resets on the 1st");

    reply = { status: 500 };
    await waitFor(() => expect(screen.getByRole("button", { name: name(SAVED.refresh) })).toBeEnabled());
    await fireEvent.press(screen.getByRole("button", { name: name(SAVED.refresh) }));
    await waitFor(async () => expect(await toastText()).toBe(REFRESH_MESSAGES.failed));
  });

  it("says why a fetch that ran didn't succeed", async () => {
    serveSources({
      "POST /discover/sources/src-1/refresh": () => ({
        status: 200,
        data: { fetch_id: "f1", status: "partial", fetched_count: 4, new_count: 0, updated_count: 0, duration_ms: 900, error_message: "Two pages timed out" },
      }),
    });
    await showRow();

    await fireEvent.press(screen.getByRole("button", { name: name(SAVED.refresh) }));

    expect(await toastText()).toBe("Two pages timed out");
  });

  it("shows the new postings being scored, polling until their scores land", async () => {
    jest.useFakeTimers();
    let jobs: DiscoveredJob[] = [discoveredJobRecord({ id: "old", title: "Old posting" })];
    const sent = serveSources(
      {
        "POST /discover/sources/src-1/refresh": () => {
          jobs = [...jobs, discoveredJobRecord({ id: "new", title: "New posting" })];
          return FETCHED;
        },
      },
      () => jobs,
    );
    await showRow();
    await screen.findByTestId("discovered-job-old");
    expect(within(screen.getByTestId("discovered-job-old")).getByText(JOB.notScored)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: name(SAVED.refresh) }));

    const fresh = await screen.findByTestId("discovered-job-new");
    expect(within(fresh).getByText(JOB.scoring)).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(MESSAGES.scoring);

    jobs = jobs.map((job) => ({ ...job, score: 90, verdict: "strong_fit", scored_at: "2026-11-11T00:00:00Z" }));
    const before = requests(sent, "GET /discover").length;
    await act(async () => jest.advanceTimersByTime(INBOX_POLL_INTERVAL_MS));
    await waitFor(() => expect(within(screen.getByTestId("discovered-job-new")).getByText("Strong fit")).toBeTruthy());
    expect(requests(sent, "GET /discover").length).toBeGreaterThan(before);

    // Nothing left to score: the polling stops.
    const settled = requests(sent, "GET /discover").length;
    await act(async () => jest.advanceTimersByTime(SCORING_WINDOW_MS));
    expect(requests(sent, "GET /discover")).toHaveLength(settled);
  });
});

describe("the scoring window when nothing new is being scored", () => {
  it("stays closed going from one saved search to All, though more unscored postings show", async () => {
    jest.useFakeTimers();
    const other = discoverySourceRecord({ id: "src-2", name: "Frontend roles" });
    const jobs = [
      discoveredJobRecord({ id: "a", discovery_source_id: "src-1" }),
      ...["b", "c", "d"].map((id) => discoveredJobRecord({ id, discovery_source_id: "src-2" })),
    ];
    const sent = serve(discoverRoutes([SOURCE, other], jobs));
    await renderDiscover();
    await screen.findByTestId("discovered-job-d");
    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.sourceFilter}, ${MESSAGES.allSources}` }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Backend roles" }));
    await waitFor(() => expect(screen.queryByTestId("discovered-job-d")).toBeNull());

    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.sourceFilter}, Backend roles` }));
    await fireEvent.press(await screen.findByRole("radio", { name: MESSAGES.allSources }));

    const widened = await screen.findByTestId("discovered-job-d");
    expect(within(widened).getByText(JOB.notScored)).toBeTruthy();
    expect(announce).not.toHaveBeenCalledWith(MESSAGES.scoring);
    const settled = requests(sent, "GET /discover").length;
    await act(async () => jest.advanceTimersByTime(SCORING_WINDOW_MS));
    expect(requests(sent, "GET /discover")).toHaveLength(settled);
  });

  it("stays closed, and doesn't poll, after a refresh that found nothing new", async () => {
    jest.useFakeTimers();
    const sent = serveSources(
      { "POST /discover/sources/src-1/refresh": () => ({ status: 200, data: { ...(FETCHED.data as object), new_count: 0 } }) },
      () => [discoveredJobRecord({ id: "old", score: 80, verdict: "strong_fit", scored_at: "2026-11-10T00:00:00Z" })],
    );
    await showRow();
    await screen.findByTestId("discovered-job-old");

    await fireEvent.press(screen.getByRole("button", { name: name(SAVED.refresh) }));
    expect(await toastText()).toBe(REFRESH_MESSAGES.fetched(12, 0));

    const settled = requests(sent, "GET /discover").length;
    await act(async () => jest.advanceTimersByTime(SCORING_WINDOW_MS));
    expect(requests(sent, "GET /discover")).toHaveLength(settled);
    expect(announce).not.toHaveBeenCalledWith(MESSAGES.scoring);
  });

  it("stays closed, and doesn't poll, after refreshing a saved search the inbox is filtered away from", async () => {
    jest.useFakeTimers();
    const other = discoverySourceRecord({ id: "src-2", name: "Frontend roles" });
    let jobs: DiscoveredJob[] = [discoveredJobRecord({ id: "a", discovery_source_id: "src-1" })];
    const sent = serve({
      ...discoverRoutes([SOURCE, other], []),
      "GET /discover": (body, params) => discoverRoutes([SOURCE, other], jobs)["GET /discover"](body, params),
      "POST /discover/sources/src-2/refresh": () => {
        jobs = [...jobs, discoveredJobRecord({ id: "b", discovery_source_id: "src-2" })];
        return FETCHED;
      },
    });
    await renderDiscover();
    await screen.findByTestId("discovered-job-a");
    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.sourceFilter}, ${MESSAGES.allSources}` }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Backend roles" }));
    await screen.findByRole("button", { name: `${MESSAGES.sourceFilter}, Backend roles` });

    await fireEvent.press(screen.getByRole("button", { name: SAVED.actionFor(SAVED.refresh, "Frontend roles") }));
    expect(await toastText()).toBe(REFRESH_MESSAGES.fetched(12, 3));

    const settled = requests(sent, "GET /discover").length;
    await act(async () => jest.advanceTimersByTime(SCORING_WINDOW_MS));
    expect(requests(sent, "GET /discover")).toHaveLength(settled);
    expect(within(screen.getByTestId("discovered-job-a")).getByText(JOB.notScored)).toBeTruthy();
    expect(announce).not.toHaveBeenCalledWith(MESSAGES.scoring);
  });

  it("stays closed after a refresh that didn't succeed", async () => {
    serveSources({ "POST /discover/sources/src-1/refresh": () => ({ status: 500 }) }, () => [discoveredJobRecord({ id: "old" })]);
    await showRow();

    await fireEvent.press(screen.getByRole("button", { name: name(SAVED.refresh) }));

    expect(await toastText()).toBe(REFRESH_MESSAGES.failed);
    expect(within(screen.getByTestId("discovered-job-old")).getByText(JOB.notScored)).toBeTruthy();
    expect(announce).not.toHaveBeenCalledWith(MESSAGES.scoring);
  });
});

describe("a saved search's schedule", () => {
  it("changes how often it refreshes", async () => {
    const sent = serveSources();
    await showRow();

    await fireEvent.press(screen.getByRole("button", { name: SAVED.editFrequency("Daily") }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Every 6 hours" }));

    expect(await toastText()).toBe(ACTIONS.frequencyUpdated);
    expect(requests(sent, "PATCH /discover/sources/src-1").map(({ body }) => body)).toEqual([{ fetch_interval_minutes: 360 }]);
    expect(await screen.findByRole("button", { name: SAVED.editFrequency("Every 6h") })).toBeTruthy();
  });

  it("sends nothing when the same frequency is chosen", async () => {
    const sent = serveSources();
    await showRow();

    await fireEvent.press(screen.getByRole("button", { name: SAVED.editFrequency("Daily") }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Daily" }));

    expect(requests(sent, "PATCH /discover/sources/src-1")).toHaveLength(0);
  });

  it("says when it couldn't change it", async () => {
    serveSources({ "PATCH /discover/sources/src-1": () => ({ status: 500 }) });
    await showRow();

    await fireEvent.press(screen.getByRole("button", { name: SAVED.editFrequency("Daily") }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Twice daily" }));

    expect(await toastText()).toBe(ACTIONS.frequencyFailed);
  });
});

describe("removing a saved search", () => {
  it("asks first, keeps it on Keep, and removes it on Remove", async () => {
    const sent = serveSources();
    await showRow();

    await fireEvent.press(screen.getByRole("button", { name: name(SAVED.remove) }));
    expect(Alert.alert).toHaveBeenLastCalledWith(SAVED.removeTitle, `"Backend roles" — ${SAVED.removeBody}`, expect.any(Array));
    await act(async () => alertButton(SAVED.keep).onPress?.());
    expect(requests(sent, "DELETE /discover/sources/src-1")).toHaveLength(0);

    await fireEvent.press(screen.getByRole("button", { name: name(SAVED.remove) }));
    await act(async () => alertButton(SAVED.remove).onPress?.());

    expect(await toastText()).toBe(ACTIONS.removed);
    await waitFor(() => expect(screen.queryByTestId("saved-search-src-1")).toBeNull());
    expect(requests(sent, "DELETE /discover/sources/src-1")).toHaveLength(1);
  });

  it("says when it couldn't remove it", async () => {
    serveSources({ "DELETE /discover/sources/src-1": () => ({ status: 500 }) });
    await showRow();

    await fireEvent.press(screen.getByRole("button", { name: name(SAVED.remove) }));
    await act(async () => alertButton(SAVED.remove).onPress?.());

    expect(await toastText()).toBe(ACTIONS.removeFailed);
    expect(screen.getByTestId("saved-search-src-1")).toBeTruthy();
  });

  it("goes back to every saved search's postings when the one chosen is removed", async () => {
    serveSources({}, () => [discoveredJobRecord({ id: "j1", discovery_source_id: "src-1" })]);
    await showRow();
    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.sourceFilter}, ${MESSAGES.allSources}` }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Backend roles" }));
    expect(await screen.findByRole("button", { name: `${MESSAGES.sourceFilter}, Backend roles` })).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: name(SAVED.remove) }));
    await act(async () => alertButton(SAVED.remove).onPress?.());

    expect(await screen.findByRole("header", { name: MESSAGES.noSavedSearchesHeading })).toBeTruthy();
  });
});

it("opens a saved search for editing", async () => {
  serveSources();
  await showRow();

  await fireEvent.press(screen.getByRole("button", { name: name(SAVED.edit) }));

  expect(await screen.findByRole("header", { name: SHEET.editTitle })).toBeTruthy();
});
