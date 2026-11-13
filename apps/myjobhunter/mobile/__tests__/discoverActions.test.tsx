import { DISCOVER_CONFLICT_CODES } from "@myjobhunter/api-client/constants/discoverConflictCodes";
import { DISCOVER_ACTION_MESSAGES as ACTIONS } from "@myjobhunter/api-client/constants/discoverMessages";
import type { DiscoveredJob } from "@myjobhunter/api-client/types/discovery/discovered-job";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { router } from "expo-router";
import { screen } from "expo-router/testing-library";
import { Linking } from "react-native";
import { Provider } from "react-redux";
import { DISCOVERED_JOB_MESSAGES as JOB } from "../src/constants/discoveredJob";
import DiscoveredJobCard from "../src/features/discover/DiscoveredJobCard";
import { store } from "../src/lib/store";
import { discoveredJobRecord } from "../test-support/discoveredJobRecord";
import { discoverRoutes } from "../test-support/discoverRoutes";
import { discoverySourceRecord } from "../test-support/discoverySourceRecord";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { renderDiscover } from "../test-support/renderDiscover";
import { storeSession } from "@platform/mobile/test-support/storedSession";
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
// What the backend's dismiss / save answer for a posting already in Applications (app/core/discovered_job_conflicts.py).
const ALREADY_APPLIED_REPLY: FakeReply = {
  status: 409,
  data: { detail: { code: DISCOVER_CONFLICT_CODES.alreadyApplied, message: "This posting is already in your Applications" } },
};

/**
 * Discovery over postings that change as the server would, plus any overrides. Like the backend, a
 * posting added to Applications leaves every view, Dismiss and Save refuse it (409) and Restore
 * finds nothing (404). `applyElsewhere` adds it to Applications from another device; `holdLists`
 * keeps the lists from answering until the function it returns is called.
 */
function serveJobs(
  initial: readonly DiscoveredJob[],
  overrides: Record<string, FakeRoute> = {},
): { sent: SentRequest[]; applyElsewhere: (id: string) => void; holdLists: () => () => void } {
  let jobs = [...initial];
  let listsHeld: Promise<void> | null = null;
  const holdLists = (): (() => void) => {
    let release: () => void = () => undefined;
    listsHeld = new Promise<void>((resolve) => (release = resolve));
    return () => {
      listsHeld = null;
      release();
    };
  };
  const change = (id: string, patch: Partial<DiscoveredJob>): void => {
    jobs = jobs.map((job) => (job.id === id ? { ...job, ...patch } : job));
  };
  const isApplied = (id: string) => jobs.some((job) => job.id === id && job.promoted_application_id !== null);
  const triage = (id: string, patch: Partial<DiscoveredJob>): FakeReply => {
    if (isApplied(id)) return ALREADY_APPLIED_REPLY;
    change(id, patch);
    return { status: 204 };
  };
  const applyElsewhere = (id: string) =>
    change(id, { promoted_application_id: "app-1", saved_at: null, dismissed_at: null, dismissed_reason: null });
  const routes = discoverRoutes([SOURCE], []);
  const sent = serve({
    ...routes,
    "GET /discover": async (body, params) => {
      if (listsHeld) await listsHeld;
      return discoverRoutes([SOURCE], jobs)["GET /discover"](body, params);
    },
    "POST /discover/j1/save": () => triage("j1", { saved_at: "2026-11-11T00:00:00Z", dismissed_at: null, dismissed_reason: null }),
    "POST /discover/j1/dismiss": () => triage("j1", { dismissed_at: "2026-11-11T00:00:00Z", saved_at: null }),
    "POST /discover/j1/undo-dismiss": () => {
      if (isApplied("j1")) return { status: 404, data: { detail: "Discovery resource not found" } };
      change("j1", { dismissed_at: null, dismissed_reason: null });
      return { status: 204 };
    },
    "POST /discover/j1/promote": () => {
      applyElsewhere("j1");
      return { status: 201, data: { id: "app-1" } };
    },
    ...overrides,
  });
  return { sent, applyElsewhere, holdLists };
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
  it("adds it to Applications, and it leaves Discover", async () => {
    const { sent } = serveJobs([POSTING]);
    await showPosting();

    await fireEvent.press(screen.getByRole("button", { name: label(JOB.apply) }));

    expect(await screen.findByText(ACTIONS.promoted)).toBeTruthy();
    expect(posted(sent, "POST /discover/j1/promote")).toHaveLength(1);
    // The refetched inbox no longer lists it: it's an application now.
    await waitFor(() => expect(screen.queryByTestId("discovered-job-j1")).toBeNull());
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

  it("shows an applied posting's card with its application instead of Apply, Save or Dismiss", async () => {
    // No Discover list includes an applied posting, so this renders the card on its own.
    const push = jest.spyOn(router, "push").mockImplementation(() => undefined);
    await render(
      <Provider store={store}>
        <ToastProvider bottomOffset={0}>
          <DiscoveredJobCard job={{ ...POSTING, promoted_application_id: "app-1" }} sources={[SOURCE]} profileUpdatedAt={null} isScoringInFlight={false} />
        </ToastProvider>
      </Provider>,
    );

    expect(screen.getByText(JOB.applied)).toBeTruthy();
    expect(screen.queryByRole("button", { name: label(JOB.apply) })).toBeNull();
    expect(screen.queryByRole("button", { name: label(JOB.dismiss) })).toBeNull();
    expect(screen.queryByRole("button", { name: label(JOB.save) })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: label(JOB.viewApplication) }));
    expect(push).toHaveBeenCalledWith("/applications/app-1");
    push.mockRestore();
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

  it("says in plain words when a dismissed posting can no longer be brought back, instead of the server's not-found", async () => {
    serveJobs([POSTING], {
      "POST /discover/j1/undo-dismiss": () => ({ status: 404, data: { detail: "Discovery resource not found" } }),
    });
    await showPosting();

    await dismissFor("Not interested");
    await fireEvent.press(await screen.findByRole("button", { name: ACTIONS.undo }));

    expect(await screen.findByText(ACTIONS.undoDismissGone)).toBeTruthy();
    expect(screen.queryByText("Discovery resource not found")).toBeNull();
    expect(screen.queryByText(ACTIONS.undone)).toBeNull();
  });

  it("keeps Save and Dismiss off while Apply is in flight, and gone once it succeeds, until the posting leaves", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    const { applyElsewhere, holdLists } = serveJobs([POSTING], {
      "POST /discover/j1/promote": () => new Promise<FakeReply>((resolve) => (answer = resolve)),
    });
    await showPosting();

    await fireEvent.press(screen.getByRole("button", { name: label(JOB.apply) }));
    await screen.findByText(JOB.applying);
    expect(screen.getByRole("button", { name: label(JOB.dismiss) })).toBeDisabled();
    expect(screen.getByRole("button", { name: label(JOB.save) })).toBeDisabled();

    // The held promote lands: the server now holds it as an application. The refetch it
    // triggers is held, so the card is still showing.
    applyElsewhere("j1");
    const releaseLists = holdLists();
    await act(async () => answer({ status: 201, data: { id: "app-1" } }));
    expect(await screen.findByText(ACTIONS.promoted)).toBeTruthy();
    // The toast can show a render before the card does.
    await waitFor(() => expect(screen.queryByRole("button", { name: label(JOB.dismiss) })).toBeNull());
    expect(screen.getByTestId("discovered-job-j1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: label(JOB.save) })).toBeNull();
    expect(screen.getByRole("button", { name: label(JOB.apply) })).toBeDisabled();

    await act(async () => releaseLists());
    await waitFor(() => expect(screen.queryByTestId("discovered-job-j1")).toBeNull());
  });

  it("keeps Apply and Dismiss off while Save is in flight", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    serveJobs([POSTING], { "POST /discover/j1/save": () => new Promise<FakeReply>((resolve) => (answer = resolve)) });
    await showPosting();

    await fireEvent.press(screen.getByRole("button", { name: label(JOB.save) }));
    await screen.findByText(JOB.saving);
    expect(screen.getByRole("button", { name: label(JOB.apply) })).toBeDisabled();
    expect(screen.getByRole("button", { name: label(JOB.dismiss) })).toBeDisabled();

    await act(async () => answer({ status: 204 }));
    expect(within(await screen.findByTestId("toast")).getByText(ACTIONS.saved)).toBeTruthy();
  });

  it("says it's already in Applications when Dismiss is refused for a card applied elsewhere, and the card goes", async () => {
    const { sent, applyElsewhere } = serveJobs([POSTING]);
    await showPosting();
    applyElsewhere("j1");

    await dismissFor("Not interested");

    expect(await screen.findByText(ACTIONS.alreadyApplied)).toBeTruthy();
    expect(screen.queryByText(ACTIONS.dismissed)).toBeNull();
    expect(posted(sent, "POST /discover/j1/dismiss")).toHaveLength(1);
    await waitFor(() => expect(screen.queryByTestId("discovered-job-j1")).toBeNull());
  });

  it("says it's already in Applications when Save is refused for a card applied elsewhere, and the card goes", async () => {
    const { sent, applyElsewhere } = serveJobs([POSTING]);
    await showPosting();
    applyElsewhere("j1");

    await fireEvent.press(screen.getByRole("button", { name: label(JOB.save) }));

    expect(await screen.findByText(ACTIONS.alreadyApplied)).toBeTruthy();
    expect(posted(sent, "POST /discover/j1/save")).toHaveLength(1);
    await waitFor(() => expect(screen.queryByTestId("discovered-job-j1")).toBeNull());
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
