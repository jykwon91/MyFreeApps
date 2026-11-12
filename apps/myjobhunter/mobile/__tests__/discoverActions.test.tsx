import { DISCOVER_ACTION_MESSAGES as ACTIONS } from "@myjobhunter/api-client/constants/discoverMessages";
import type { DiscoveredJob } from "@myjobhunter/api-client/types/discovery/discovered-job";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, waitFor, within } from "@testing-library/react-native";
import { router } from "expo-router";
import { screen } from "expo-router/testing-library";
import { Linking } from "react-native";
import { DISCOVERED_JOB_MESSAGES as JOB } from "../src/constants/discoveredJob";
import { store } from "../src/lib/store";
import { applicationDetailRecord } from "../test-support/applicationDetailRecord";
import { applicationDetailRoutes } from "../test-support/applicationDetailRoutes";
import { discoveredJobRecord } from "../test-support/discoveredJobRecord";
import { discoverRoutes } from "../test-support/discoverRoutes";
import { discoverySourceRecord } from "../test-support/discoverySourceRecord";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { renderApp } from "../test-support/renderApp";
import { renderDiscover } from "../test-support/renderDiscover";
import { storeSession, tokens } from "@platform/mobile/test-support/storedSession";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { FakeRoute } from "@platform/mobile/test-support/types/FakeRoute";
import type { SentRequest } from "@platform/mobile/test-support/types/SentRequest";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);

const SOURCE = discoverySourceRecord({ id: "src-1", name: "Backend roles" });
const POSTING = discoveredJobRecord({ id: "j1", title: "Staff Engineer", company_name: "Globex", source_url: "https://jobs.example.com/1" });
const label = (action: string) => JOB.actionFor(action, "Staff Engineer", "Globex");
const posted = (sent: SentRequest[], route: string) => sent.filter((request) => request.route === route);

/** Discovery over postings that change as the server would, plus any overrides. */
function serveJobs(initial: readonly DiscoveredJob[], overrides: Record<string, FakeRoute> = {}): { sent: SentRequest[]; jobs: () => DiscoveredJob[] } {
  let jobs = [...initial];
  const change = (id: string, patch: Partial<DiscoveredJob>): FakeReply => {
    jobs = jobs.map((job) => (job.id === id ? { ...job, ...patch } : job));
    return { status: 204 };
  };
  const routes = discoverRoutes([SOURCE], []);
  const sent = serve({
    ...routes,
    "GET /discover": (body, params) => discoverRoutes([SOURCE], jobs)["GET /discover"](body, params),
    "POST /discover/j1/save": () => change("j1", { saved_at: "2026-11-11T00:00:00Z" }),
    "POST /discover/j1/dismiss": () => change("j1", { dismissed_at: "2026-11-11T00:00:00Z" }),
    "POST /discover/j1/undo-dismiss": () => change("j1", { dismissed_at: null }),
    "POST /discover/j1/promote": () => {
      change("j1", { promoted_application_id: "app-1" });
      return { status: 201, data: { id: "app-1" } };
    },
    ...overrides,
  });
  return { sent, jobs: () => jobs };
}

async function showPosting(): Promise<void> {
  await renderDiscover();
  await screen.findByTestId("discovered-job-j1");
}

async function dismissFor(reason: string): Promise<void> {
  // Once any dismiss before this one has settled.
  await waitFor(() => expect(screen.getByRole("button", { name: label(JOB.dismiss) })).toBeEnabled());
  await fireEvent.press(screen.getByRole("button", { name: label(JOB.dismiss) }));
  await fireEvent.press(await screen.findByRole("radio", { name: reason }));
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

describe("a discovered posting's actions", () => {
  it("adds it to Applications, then offers the application instead", async () => {
    const { sent } = serveJobs([POSTING]);
    await showPosting();

    await fireEvent.press(screen.getByRole("button", { name: label(JOB.apply) }));

    expect(await screen.findByText(ACTIONS.promoted)).toBeTruthy();
    expect(posted(sent, "POST /discover/j1/promote")).toHaveLength(1);
    const card = screen.getByTestId("discovered-job-j1");
    expect(await within(card).findByRole("button", { name: label(JOB.viewApplication) })).toBeTruthy();
    expect(within(card).getByText(JOB.applied)).toBeTruthy();
    expect(within(card).queryByRole("button", { name: label(JOB.apply) })).toBeNull();
    // An applied posting can't be saved for later as well.
    expect(within(card).getByRole("button", { name: label(JOB.save) })).toBeDisabled();
  });

  it("shows Adding… from the press until the server answers", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    serveJobs([POSTING], { "POST /discover/j1/promote": () => new Promise<FakeReply>((resolve) => (answer = resolve)) });
    await showPosting();

    await fireEvent.press(screen.getByRole("button", { name: label(JOB.apply) }));

    expect(await screen.findByText(JOB.applying)).toBeTruthy();
    await act(async () => answer({ status: 201, data: { id: "app-1" } }));
    expect(await screen.findByText(ACTIONS.promoted)).toBeTruthy();
  });

  it("says why it couldn't add it, or that it couldn't when the server doesn't say", async () => {
    let reply: FakeReply = { status: 409, data: { detail: "Already an application for this posting" } };
    serveJobs([POSTING], { "POST /discover/j1/promote": () => reply });
    await showPosting();

    await fireEvent.press(screen.getByRole("button", { name: label(JOB.apply) }));
    expect(await screen.findByText("Already an application for this posting")).toBeTruthy();

    reply = { status: 500 };
    await fireEvent.press(screen.getByRole("button", { name: label(JOB.apply) }));
    expect(await screen.findByText(ACTIONS.promoteFailed)).toBeTruthy();
  });

  it("opens the application it became, and comes back", async () => {
    serve({
      "POST /auth/mobile/refresh": () => ({ status: 200, data: tokens(1) }),
      ...discoverRoutes([SOURCE], [{ ...POSTING, promoted_application_id: "app-1" }]),
      ...applicationDetailRoutes(applicationDetailRecord({ id: "app-1", role_title: "Staff Engineer at Globex" })),
    });
    await renderApp("/discover");

    await fireEvent.press(await screen.findByRole("button", { name: label(JOB.viewApplication) }));

    expect(screen).toHavePathname("/applications/app-1");
    expect(await screen.findByRole("header", { name: "Staff Engineer at Globex" })).toBeTruthy();
    await act(async () => router.back());
    expect(screen).toHavePathname("/discover");
  });

  it("saves it for later, moving it to Saved", async () => {
    const { sent } = serveJobs([POSTING]);
    await showPosting();

    await fireEvent.press(screen.getByRole("button", { name: label(JOB.save) }));

    expect(within(await screen.findByTestId("toast")).getByText(ACTIONS.saved)).toBeTruthy();
    expect(posted(sent, "POST /discover/j1/save")).toHaveLength(1);
    await waitFor(() => expect(screen.queryByTestId("discovered-job-j1")).toBeNull());
    await fireEvent.press(screen.getByRole("tab", { name: "Saved" }));
    const card = await screen.findByTestId("discovered-job-j1");
    expect(within(card).getByRole("button", { name: label(JOB.saved) })).toBeDisabled();
  });

  it("says when it couldn't save it", async () => {
    serveJobs([POSTING], { "POST /discover/j1/save": () => ({ status: 500 }) });
    await showPosting();

    await fireEvent.press(screen.getByRole("button", { name: label(JOB.save) }));

    expect(await screen.findByText(ACTIONS.saveFailed)).toBeTruthy();
    expect(screen.getByTestId("discovered-job-j1")).toBeTruthy();
  });

  it("dismisses it with the reason chosen, and Undo brings it back", async () => {
    const { sent } = serveJobs([POSTING]);
    await showPosting();

    await dismissFor("Wrong tech stack");

    expect(await screen.findByText(ACTIONS.dismissed)).toBeTruthy();
    expect(posted(sent, "POST /discover/j1/dismiss").map(({ body }) => body)).toEqual([{ reason: "wrong_stack" }]);
    await waitFor(() => expect(screen.queryByTestId("discovered-job-j1")).toBeNull());

    const undo = screen.getByRole("button", { name: ACTIONS.undo });
    expect(undo.props.accessibilityHint).toBe(ACTIONS.undoHint);
    await fireEvent.press(undo);

    expect(await screen.findByText(ACTIONS.undone)).toBeTruthy();
    expect(posted(sent, "POST /discover/j1/undo-dismiss")).toHaveLength(1);
    // Undo runs after the card unmounted, so it must leave no mutation record behind.
    const mutations = Object.values(store.getState()[baseApi.reducerPath].mutations);
    expect(mutations.filter((entry) => entry?.endpointName === "undoDismissDiscoveredJob")).toEqual([]);
    const back = await screen.findByTestId("discovered-job-j1");
    // Bringing an unscored posting back isn't a refresh: nothing new is being scored.
    expect(within(back).getByText(JOB.notScored)).toBeTruthy();
    expect(within(back).queryByText(JOB.scoring)).toBeNull();
  });

  it("dismisses it without a reason on Skip", async () => {
    const { sent } = serveJobs([POSTING]);
    await showPosting();

    await dismissFor("Skip — dismiss without a reason");

    expect(await screen.findByText(ACTIONS.dismissed)).toBeTruthy();
    expect(posted(sent, "POST /discover/j1/dismiss").map(({ body }) => body)).toEqual([{}]);
  });

  it("keeps it when the reasons are closed", async () => {
    const { sent } = serveJobs([POSTING]);
    await showPosting();

    await fireEvent.press(screen.getByRole("button", { name: label(JOB.dismiss) }));
    await fireEvent.press(await screen.findByRole("button", { name: "Close" }));

    expect(posted(sent, "POST /discover/j1/dismiss")).toHaveLength(0);
    expect(screen.getByTestId("discovered-job-j1")).toBeTruthy();
  });

  it("says when it couldn't dismiss it, or undo the dismiss", async () => {
    let dismissReply: FakeReply = { status: 500 };
    serveJobs([POSTING], {
      "POST /discover/j1/dismiss": () => dismissReply,
      "POST /discover/j1/undo-dismiss": () => ({ status: 500 }),
    });
    await showPosting();

    await dismissFor("Not interested");
    expect(await screen.findByText(ACTIONS.dismissFailed)).toBeTruthy();
    expect(screen.getByTestId("discovered-job-j1")).toBeTruthy();

    dismissReply = { status: 204 };
    await dismissFor("Not interested");
    await fireEvent.press(await screen.findByRole("button", { name: ACTIONS.undo }));
    expect(await screen.findByText(ACTIONS.undoFailed)).toBeTruthy();
  });

  it("shows Opening… from the tap until the posting's own page opens", async () => {
    let opened: () => void = () => undefined;
    openURL.mockImplementationOnce(() => new Promise<void>((resolve) => (opened = resolve)));
    serveJobs([POSTING]);
    await showPosting();

    await fireEvent.press(screen.getByRole("button", { name: label(JOB.open) }));

    expect(await screen.findByText(JOB.opening)).toBeTruthy();
    expect(openURL).toHaveBeenCalledWith("https://jobs.example.com/1");
    await act(async () => opened());
    await waitFor(() => expect(screen.queryByText(JOB.opening)).toBeNull());
  });

  it("offers no Open for a posting without a link it's safe to open", async () => {
    serveJobs([{ ...POSTING, source_url: "javascript:alert(1)" }]);
    await showPosting();

    expect(screen.queryByRole("button", { name: label(JOB.open) })).toBeNull();
  });

  it("marks a score made before the profile last changed", async () => {
    const stale = { ...POSTING, score: 70, verdict: "worth_considering" as const, scored_at: "2026-09-01T00:00:00Z" };
    serveJobs([stale]);
    await showPosting();

    expect(within(screen.getByTestId("discovered-job-j1")).getByText(JOB.reScoring)).toBeTruthy();
  });
});
