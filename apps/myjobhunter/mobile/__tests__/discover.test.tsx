import { COVERAGE_MESSAGES } from "@myjobhunter/api-client/constants/discoverMessages";
import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import { act, fireEvent, waitFor, within } from "@testing-library/react-native";
import { screen } from "expo-router/testing-library";
import { AccessibilityInfo, Linking } from "react-native";
import { WEB_BASE_URL } from "../src/constants/api";
import { DISCOVERED_JOB_MESSAGES as JOB } from "../src/constants/discoveredJob";
import { DISCOVER_SCREEN_MESSAGES as MESSAGES } from "../src/constants/discoverScreen";
import { PROFILE_BANNER_DISMISSED_KEY, PROFILE_BANNER_MESSAGES as BANNER, PROFILE_WEB_PATH } from "../src/constants/profileBanner";
import { SAVED_SEARCH_MESSAGES as SAVED } from "../src/constants/savedSearches";
import { store } from "../src/lib/store";
import { discoveredJobRecord } from "../test-support/discoveredJobRecord";
import { discoverRoutes, discoverPage, jobsFor } from "../test-support/discoverRoutes";
import { discoverySourceRecord } from "../test-support/discoverySourceRecord";
import { serve } from "../test-support/fakeServer";
import { storedItems } from "../test-support/memorySecureStore";
import { profileRecord } from "../test-support/profileRecord";
import { renderApp } from "../test-support/renderApp";
import { renderDiscover } from "../test-support/renderDiscover";
import { storeSession, tokens } from "../test-support/storedSession";
import type { FakeReply } from "../test-support/types/FakeReply";
import type { SentRequest } from "../test-support/types/SentRequest";

jest.mock("expo-secure-store", () => jest.requireActual("../test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("../test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);

const BACKEND = discoverySourceRecord({ id: "src-backend", name: "Backend roles", last_fetched_at: "2026-11-10T00:00:00Z" });
const STRIPE = discoverySourceRecord({ id: "src-stripe", source: "greenhouse", config: { board_token: "stripe" } });
const SOURCES = [BACKEND, STRIPE] as const;
// The server's order: best score first.
const STRONG = discoveredJobRecord({
  id: "j-strong",
  title: "Staff Engineer",
  company_name: "Globex",
  location: "Austin, TX",
  remote_type: "remote",
  score: 92,
  verdict: "strong_fit",
  score_reason: "Matches your Python and FastAPI work",
  scored_at: "2026-10-05T00:00:00Z",
  source_publisher: "LinkedIn",
  description: "Build the platform.",
  discovery_source_id: BACKEND.id,
});
const PLAIN = discoveredJobRecord({ id: "j-plain", title: "Platform Engineer", company_name: "Initech", discovery_source_id: STRIPE.id });
const KEPT = discoveredJobRecord({ id: "j-kept", title: "Data Engineer", company_name: "Hooli", saved_at: "2026-11-09T00:00:00Z", discovery_source_id: BACKEND.id });
const JOBS = [STRONG, PLAIN, KEPT] as const;

const titles = (): string[] => screen.queryAllByTestId("discovered-job-title").map((title) => String(title.props.children));
const discoverRequests = (sent: SentRequest[]) => sent.filter(({ route }) => route === "GET /discover");

async function pullToRefresh(): Promise<void> {
  await act(async () => {
    await screen.getByTestId("discover-list").props.refreshControl.props.onRefresh();
  });
}

// The shared store's queries hold RTK Query's timer for dropping unused data (60s), which would
// keep Jest from exiting; resetting the store clears it.
afterAll(() => store.dispatch(baseApi.util.resetApiState()));

beforeEach(() => {
  storedItems.clear();
  storeSession();
  jest.clearAllMocks();
  store.dispatch(baseApi.util.resetApiState());
});

describe("the Discovery screen", () => {
  it("opens from More on the phone, not the website", async () => {
    serve({ "POST /auth/mobile/refresh": () => ({ status: 200, data: tokens(1) }), "GET /auth/mobile/sessions": () => ({ status: 200, data: [] }), ...discoverRoutes([], []) });
    await renderApp("/more");

    await fireEvent.press(await screen.findByRole("button", { name: "Discovery" }));

    expect(screen).toHavePathname("/discover");
    expect(await screen.findByRole("header", { name: MESSAGES.noSavedSearchesHeading })).toBeTruthy();
    expect(openURL).not.toHaveBeenCalled();
  });

  it("opens on skeletons of the saved searches and postings, then shows what the website shows", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    const sent = serve({
      ...discoverRoutes(SOURCES, JOBS),
      "GET /discover": () => new Promise<FakeReply>((resolve) => (answer = resolve)),
    });
    await renderDiscover();

    expect(await screen.findByLabelText(MESSAGES.loadingJobs)).toBeTruthy();
    expect(screen.getAllByTestId("discovered-job-skeleton-card").length).toBeGreaterThan(0);
    expect(screen.getByText(MESSAGES.subtitle)).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.newSavedSearch })).toBeTruthy();

    await act(async () => answer(discoverPage(jobsFor(JOBS, { state: "inbox" }), { state: "inbox", offset: 0, limit: 50 })));

    const strong = await screen.findByTestId("discovered-job-j-strong");
    expect(screen.queryByLabelText(MESSAGES.loadingJobs)).toBeNull();
    expect(within(strong).getByText("Strong fit")).toBeTruthy();
    expect(within(strong).getByText("LinkedIn")).toBeTruthy();
    expect(within(strong).getByText("Backend roles")).toBeTruthy();
    expect(within(strong).getByText("Globex — Austin, TX")).toBeTruthy();
    expect(within(strong).getByText("Remote")).toBeTruthy();
    expect(within(strong).getByText("Matches your Python and FastAPI work")).toBeTruthy();
    expect(within(strong).getByText("Build the platform.").props.numberOfLines).toBe(3);
    // Unscored outside the scoring window: a still "Not scored", not a spinner that never ends.
    expect(within(screen.getByTestId("discovered-job-j-plain")).getByText(JOB.notScored)).toBeTruthy();
    expect(titles()).toEqual(["Staff Engineer", "Platform Engineer"]);
    expect(screen.getByTestId("inbox-scoring-coverage").props.children).toBe(`${COVERAGE_MESSAGES.scored(1, 2)}${COVERAGE_MESSAGES.restAwait}`);

    const row = screen.getByTestId(`saved-search-${BACKEND.id}`);
    expect(within(row).getByText("Backend roles")).toBeTruthy();
    expect(within(row).getByText("JSearch")).toBeTruthy();
    expect(within(row).getByText("Backend Engineer")).toBeTruthy();
    expect(within(screen.getByTestId(`saved-search-${STRIPE.id}`)).getByText("Board: stripe")).toBeTruthy();
    expect(within(row).getByRole("button", { name: SAVED.editFrequency("Daily") })).toBeTruthy();
    expect(discoverRequests(sent).map(({ params }) => params)).toEqual([{ state: "inbox", limit: 50, offset: 0 }]);
    expect(announce).toHaveBeenCalledWith(MESSAGES.listSummary("inbox", 2));
  });

  it("shows a saved search's failing fetch and its error", async () => {
    serve(discoverRoutes([discoverySourceRecord({ id: "bad", consecutive_failures: 2, last_error_message: "JSearch quota exceeded" })], []));
    await renderDiscover();

    const row = await screen.findByTestId("saved-search-bad");
    expect(within(row).getByText(SAVED.fetchFailed)).toBeTruthy();
    expect(within(row).getByText("JSearch quota exceeded")).toBeTruthy();
  });

  it("switches to Saved and back, announcing what each shows", async () => {
    const sent = serve(discoverRoutes(SOURCES, JOBS));
    await renderDiscover();
    await screen.findByTestId("discovered-job-j-strong");

    await fireEvent.press(screen.getByRole("tab", { name: "Saved" }));

    expect(await screen.findByTestId("discovered-job-j-kept")).toBeTruthy();
    expect(titles()).toEqual(["Data Engineer"]);
    expect(screen.queryByTestId("inbox-scoring-coverage")).toBeNull();
    expect(announce).toHaveBeenLastCalledWith(MESSAGES.listSummary("saved", 1));

    await fireEvent.press(screen.getByRole("tab", { name: "Inbox" }));
    await waitFor(() => expect(titles()).toEqual(["Staff Engineer", "Platform Engineer"]));
    // Coming back to the inbox shows what it loaded first.
    expect(discoverRequests(sent).map(({ params }) => params.state)).toEqual(["inbox", "saved"]);
  });

  it("filters both views by saved search on the server, and offers every saved search again when one has none", async () => {
    const sent = serve(discoverRoutes(SOURCES, JOBS));
    await renderDiscover();
    await screen.findByTestId("discovered-job-j-strong");

    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.sourceFilter}, ${MESSAGES.allSources}` }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Backend roles" }));

    await waitFor(() => expect(titles()).toEqual(["Staff Engineer"]));
    expect(discoverRequests(sent).at(-1)?.params).toEqual({ state: "inbox", source_id: BACKEND.id, limit: 50, offset: 0 });

    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.sourceFilter}, Backend roles` }));
    await fireEvent.press(await screen.findByRole("radio", { name: "greenhouse" }));
    await fireEvent.press(screen.getByRole("tab", { name: "Saved" }));

    expect(await screen.findByRole("header", { name: MESSAGES.savedEmptyHeading })).toBeTruthy();
    expect(discoverRequests(sent).at(-1)?.params).toEqual({ state: "saved", source_id: STRIPE.id, limit: 50, offset: 0 });
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.showAllSources }));
    expect(await screen.findByTestId("discovered-job-j-kept")).toBeTruthy();
  });

  it("asks for a saved search first when there are none, as the website's inbox does", async () => {
    serve(discoverRoutes([], JOBS));
    await renderDiscover();

    expect(await screen.findByRole("header", { name: MESSAGES.noSavedSearchesHeading })).toBeTruthy();
    expect(screen.getByText(MESSAGES.noSavedSearchesBody)).toBeTruthy();
    expect(titles()).toEqual([]);
    // No saved searches to filter by, so no filter.
    expect(screen.queryByText(MESSAGES.sourceFilter)).toBeNull();
    expect(screen.queryByText(SAVED.heading)).toBeNull();
  });

  it("says when the inbox and saved jobs are empty", async () => {
    serve(discoverRoutes(SOURCES, []));
    await renderDiscover();

    expect(await screen.findByRole("header", { name: MESSAGES.inboxEmptyHeading })).toBeTruthy();
    expect(screen.getByText(MESSAGES.inboxEmptyBody)).toBeTruthy();
    expect(screen.queryByTestId("inbox-scoring-coverage")).toBeNull();
    await fireEvent.press(screen.getByRole("tab", { name: "Saved" }));
    expect(await screen.findByRole("header", { name: MESSAGES.savedEmptyHeading })).toBeTruthy();
    expect(screen.getByText(MESSAGES.savedEmptyBody)).toBeTruthy();
  });

  it("says when the postings couldn't load, and loads them on Try again", async () => {
    let reply: FakeReply = { status: 500, data: { detail: "boom" } };
    serve({ ...discoverRoutes(SOURCES, JOBS), "GET /discover": () => reply });
    await renderDiscover();

    expect(await screen.findByRole("header", { name: MESSAGES.couldntLoadInbox })).toBeTruthy();
    reply = discoverPage([STRONG], { offset: 0, limit: 50 });
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));

    expect(await screen.findByTestId("discovered-job-j-strong")).toBeTruthy();
  });

  it("says when saved jobs couldn't load", async () => {
    serve({ ...discoverRoutes(SOURCES, JOBS), "GET /discover": (_body, params) => (params.state === "saved" ? { status: 500 } : discoverPage([STRONG], params)) });
    await renderDiscover();
    await screen.findByTestId("discovered-job-j-strong");

    await fireEvent.press(screen.getByRole("tab", { name: "Saved" }));

    expect(await screen.findByRole("header", { name: MESSAGES.couldntLoadSaved })).toBeTruthy();
  });

  it("says when the saved searches couldn't load, and loads them on Try again", async () => {
    let reply: FakeReply = { status: 500 };
    serve({ ...discoverRoutes(SOURCES, JOBS), "GET /discover/sources": () => reply });
    await renderDiscover();

    expect(await screen.findByText(SAVED.couldntLoad)).toBeTruthy();
    reply = { status: 200, data: SOURCES };
    await fireEvent.press(screen.getByRole("button", { name: SAVED.tryAgain }));

    expect(await screen.findByTestId(`saved-search-${BACKEND.id}`)).toBeTruthy();
  });

  it("pulls to refresh the postings and saved searches, keeping what loaded if that fails", async () => {
    let jobs: readonly typeof STRONG[] = [STRONG];
    let isDown = false;
    serve({
      ...discoverRoutes(SOURCES, JOBS),
      "GET /discover": (_body, params) => (isDown ? { status: 503 } : discoverPage(jobs, params)),
    });
    await renderDiscover();
    await screen.findByTestId("discovered-job-j-strong");

    jobs = [STRONG, PLAIN];
    await pullToRefresh();
    await waitFor(() => expect(titles()).toEqual(["Staff Engineer", "Platform Engineer"]));

    isDown = true;
    await pullToRefresh();
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(titles()).toEqual(["Staff Engineer", "Platform Engineer"]);
  });
});

describe("the profile reminder", () => {
  it("asks for a resume or skills when the profile has neither, and opens the website's profile", async () => {
    serve(discoverRoutes(SOURCES, JOBS, { profile: profileRecord({ resume_file_path: null }), skills: 0 }));
    await renderDiscover();

    expect(await screen.findByRole("header", { name: BANNER.heading })).toBeTruthy();
    expect(screen.getByText(BANNER.body)).toBeTruthy();
    await fireEvent.press(screen.getByRole("link", { name: BANNER.setUp }));

    expect(openURL).toHaveBeenCalledWith(`${WEB_BASE_URL}${PROFILE_WEB_PATH}`);
  });

  it("stays away once dismissed, on this phone", async () => {
    serve(discoverRoutes(SOURCES, JOBS, { profile: profileRecord({ resume_file_path: null }), skills: 0 }));
    await renderDiscover();

    await fireEvent.press(await screen.findByRole("button", { name: BANNER.dismiss }));

    expect(screen.queryByTestId("profile-completeness-banner")).toBeNull();
    expect(storedItems.get(PROFILE_BANNER_DISMISSED_KEY)).toBe("true");
    await screen.unmount();
    await renderDiscover();
    await screen.findByTestId("discovered-job-j-strong");
    expect(screen.queryByTestId("profile-completeness-banner")).toBeNull();
  });

  it("isn't shown with a resume or a skill, or on the Saved tab", async () => {
    serve(discoverRoutes(SOURCES, JOBS, { profile: profileRecord({ resume_file_path: null }), skills: 1 }));
    await renderDiscover();
    await screen.findByTestId("discovered-job-j-strong");
    expect(screen.queryByTestId("profile-completeness-banner")).toBeNull();

    await screen.unmount();
    store.dispatch(baseApi.util.resetApiState());
    serve(discoverRoutes(SOURCES, JOBS, { profile: profileRecord({ resume_file_path: null }), skills: 0 }));
    await renderDiscover();
    expect(await screen.findByTestId("profile-completeness-banner")).toBeTruthy();
    await fireEvent.press(screen.getByRole("tab", { name: "Saved" }));
    await screen.findByTestId("discovered-job-j-kept");
    expect(screen.queryByTestId("profile-completeness-banner")).toBeNull();
  });
});
