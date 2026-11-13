/**
 * The Dismissed tab on the phone, at parity with the website's: dismissed postings in the server's
 * order (the backend's tests own newest-first), each with when and why it was dismissed, Open and
 * Restore; Restore's in-flight state, toast, staying disabled until the card leaves, and the posting
 * moving back to the inbox; a Restore of a posting already restored elsewhere (404) and one the
 * server fails (500); the empty and error states; and the skeleton matching the dismissed cards.
 */
import { DISCOVER_ACTION_MESSAGES as ACTIONS } from "@myjobhunter/api-client/constants/discoverMessages";
import type { DiscoveredJob } from "@myjobhunter/api-client/types/discovery/discovered-job";
import { dismissalSummary } from "@myjobhunter/api-client/utils/dismissalSummary";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, waitFor, within } from "@testing-library/react-native";
import { screen } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import { DISCOVER_SCREEN_MESSAGES as MESSAGES } from "../src/constants/discoverScreen";
import { DISCOVERED_JOB_MESSAGES as JOB } from "../src/constants/discoveredJob";
import { store } from "../src/lib/store";
import { discoveredJobRecord } from "../test-support/discoveredJobRecord";
import { discoverPage, discoverRoutes, jobsFor } from "../test-support/discoverRoutes";
import { discoverySourceRecord } from "../test-support/discoverySourceRecord";
import { renderDiscover } from "../test-support/renderDiscover";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { storeSession } from "@platform/mobile/test-support/storedSession";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { FakeRoute } from "@platform/mobile/test-support/types/FakeRoute";
import type { SentRequest } from "@platform/mobile/test-support/types/SentRequest";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);

const SOURCE = discoverySourceRecord({ id: "src-1", name: "Backend roles" });
const OLDER = discoveredJobRecord({
  id: "j-older",
  title: "Data Engineer",
  company_name: "Hooli",
  dismissed_at: "2026-11-01T00:00:00Z",
  dismissed_reason: null,
});
const NEWER = discoveredJobRecord({
  id: "j-newer",
  title: "Staff Engineer",
  company_name: "Globex",
  source_url: "https://jobs.example.com/1",
  dismissed_at: "2026-11-10T00:00:00Z",
  dismissed_reason: "wrong_stack",
});
const restoreLabel = JOB.actionFor(JOB.restore, "Staff Engineer", "Globex");
const titles = (): string[] => screen.queryAllByTestId("discovered-job-title").map((title) => String(title.props.children));
const discoverStates = (sent: SentRequest[]) => sent.filter(({ route }) => route === "GET /discover").map(({ params }) => params.state);

/** Discovery over postings that move between views as the server moves them, plus any overrides. */
function serveJobs(initial: readonly DiscoveredJob[], overrides: Record<string, FakeRoute> = {}): SentRequest[] {
  let jobs = [...initial];
  const routes: Record<string, FakeRoute> = {
    ...discoverRoutes([SOURCE], []),
    "GET /discover": (body, params) => discoverRoutes([SOURCE], jobs)["GET /discover"](body, params),
  };
  for (const job of initial) {
    routes[`POST /discover/${job.id}/undo-dismiss`] = () => {
      jobs = jobs.map((candidate) => (candidate.id === job.id ? { ...candidate, dismissed_at: null, dismissed_reason: null } : candidate));
      return { status: 204 };
    };
  }
  return serve({ ...routes, ...overrides });
}

async function openDismissed(): Promise<void> {
  await renderDiscover();
  await fireEvent.press(await screen.findByRole("tab", { name: "Dismissed" }));
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

describe("the Dismissed tab", () => {
  it("lists the dismissed postings in the server's order, with when and why, Open and Restore in place of the triage buttons", async () => {
    const sent = serveJobs([OLDER, NEWER]);
    await openDismissed();

    const newer = await screen.findByTestId("discovered-job-j-newer");
    // The fake server sorts like the backend; this checks the screen keeps its order, not the sorting itself.
    expect(titles()).toEqual(["Staff Engineer", "Data Engineer"]);
    expect(discoverStates(sent)).toEqual(["inbox", "dismissed"]);
    expect(announce).toHaveBeenLastCalledWith(MESSAGES.listSummary("dismissed", 2));
    expect(within(newer).getByTestId("dismissal-summary").props.children).toBe(dismissalSummary(NEWER));
    expect(dismissalSummary(NEWER)).toMatch(/· Wrong tech stack$/);
    expect(within(screen.getByTestId("discovered-job-j-older")).getByTestId("dismissal-summary").props.children).toBe(dismissalSummary(OLDER));
    const restore = within(newer).getByRole("button", { name: restoreLabel });
    expect(restore.props.accessibilityHint).toBe(ACTIONS.restoreHint);
    expect(within(newer).getByRole("button", { name: JOB.actionFor(JOB.open, "Staff Engineer", "Globex") })).toBeTruthy();
    expect(within(newer).queryByRole("button", { name: JOB.actionFor(JOB.apply, "Staff Engineer", "Globex") })).toBeNull();
    expect(within(newer).queryByRole("button", { name: JOB.actionFor(JOB.save, "Staff Engineer", "Globex") })).toBeNull();
    expect(within(newer).queryByRole("button", { name: JOB.actionFor(JOB.dismiss, "Staff Engineer", "Globex") })).toBeNull();
  });

  it("Restore shows Restoring… from the press, confirms, and the posting moves back to the inbox", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    let restored = false;
    const sent = serveJobs([NEWER], {
      "GET /discover": (_body, params) => {
        const jobs = [{ ...NEWER, ...(restored ? { dismissed_at: null, dismissed_reason: null } : {}) }];
        return discoverPage(jobsFor(jobs, params), params);
      },
      "POST /discover/j-newer/undo-dismiss": () =>
        new Promise<FakeReply>((resolve) => {
          answer = (reply) => {
            restored = true;
            resolve(reply);
          };
        }),
    });
    await openDismissed();
    await fireEvent.press(await screen.findByRole("button", { name: restoreLabel }));

    expect(await screen.findByText(JOB.restoring)).toBeTruthy();
    expect(screen.getByRole("button", { name: restoreLabel })).toBeDisabled();
    await act(async () => answer({ status: 204 }));

    expect(await screen.findByText(ACTIONS.restored)).toBeTruthy();
    expect(sent.filter(({ route }) => route === "POST /discover/j-newer/undo-dismiss")).toHaveLength(1);
    expect(await screen.findByRole("header", { name: MESSAGES.dismissedEmptyHeading })).toBeTruthy();

    await fireEvent.press(screen.getByRole("tab", { name: "Inbox" }));
    expect(await screen.findByTestId("discovered-job-j-newer")).toBeTruthy();
  });

  it("Restore stays disabled after it succeeds, until the refetched list drops the card", async () => {
    let restored = false;
    let releaseRefetch: (reply: FakeReply) => void = () => undefined;
    serveJobs([NEWER], {
      "GET /discover": (_body, params) => {
        if (restored && params.state === "dismissed") return new Promise<FakeReply>((resolve) => (releaseRefetch = resolve));
        return discoverPage(jobsFor([NEWER], params), params);
      },
      "POST /discover/j-newer/undo-dismiss": () => {
        restored = true;
        return { status: 204 };
      },
    });
    await openDismissed();
    await fireEvent.press(await screen.findByRole("button", { name: restoreLabel }));

    expect(await screen.findByText(ACTIONS.restored)).toBeTruthy();
    // The card is still on screen while the list refetches; a second tap would 404, so Restore stays off.
    expect(screen.getByTestId("discovered-job-j-newer")).toBeTruthy();
    expect(screen.getByRole("button", { name: restoreLabel })).toBeDisabled();

    await act(async () => releaseRefetch(discoverPage([], { state: "dismissed", offset: 0, limit: 50 })));
    await waitFor(() => expect(screen.queryByTestId("discovered-job-j-newer")).toBeNull());
  });

  it("Restore on a posting already restored elsewhere says so in plain words, and the card goes", async () => {
    let restoredElsewhere = false;
    serveJobs([NEWER], {
      "GET /discover": (_body, params) => {
        const jobs = [{ ...NEWER, ...(restoredElsewhere ? { dismissed_at: null, dismissed_reason: null } : {}) }];
        return discoverPage(jobsFor(jobs, params), params);
      },
      "POST /discover/j-newer/undo-dismiss": () => ({ status: 404, data: { detail: "Discovery resource not found" } }),
    });
    await openDismissed();
    await screen.findByTestId("discovered-job-j-newer");
    restoredElsewhere = true;

    await fireEvent.press(screen.getByRole("button", { name: restoreLabel }));

    expect(await screen.findByText(ACTIONS.undoDismissGone)).toBeTruthy();
    expect(screen.queryByText("Discovery resource not found")).toBeNull();
    expect(await screen.findByRole("header", { name: MESSAGES.dismissedEmptyHeading })).toBeTruthy();
    expect(screen.queryByTestId("discovered-job-j-newer")).toBeNull();
  });

  it("a Restore the server fails says it couldn't, keeps the posting, and offers Restore again", async () => {
    serveJobs([NEWER], { "POST /discover/j-newer/undo-dismiss": () => ({ status: 500 }) });
    await openDismissed();

    await fireEvent.press(await screen.findByRole("button", { name: restoreLabel }));
    expect(await screen.findByText(ACTIONS.restoreFailed)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: restoreLabel })).toBeEnabled());
    expect(screen.getByTestId("discovered-job-j-newer")).toBeTruthy();
  });

  it("says when nothing is dismissed, and when the list couldn't load", async () => {
    serveJobs([]);
    await openDismissed();
    expect(await screen.findByRole("header", { name: MESSAGES.dismissedEmptyHeading })).toBeTruthy();
    expect(screen.getByText(MESSAGES.dismissedEmptyBody)).toBeTruthy();

    store.dispatch(baseApi.util.resetApiState());
    serveJobs([NEWER], { "GET /discover": (_body, params) => (params.state === "dismissed" ? { status: 500 } : discoverPage([], params)) });
    await openDismissed();
    expect(await screen.findByRole("header", { name: MESSAGES.couldntLoadDismissed })).toBeTruthy();
  });

  it("shows skeletons shaped like dismissed cards while the list loads: the dismissal line and one row of buttons", async () => {
    let answer: ((reply: FakeReply) => void) | undefined;
    serveJobs([NEWER], {
      "GET /discover": (_body, params) =>
        params.state === "dismissed" ? new Promise<FakeReply>((resolve) => (answer = resolve)) : discoverPage([], params),
    });
    await openDismissed();

    // The inbox's own skeleton shows first; wait until the Dismissed list is the one loading.
    await waitFor(() => expect(answer).toBeDefined());
    expect(await screen.findByLabelText(MESSAGES.loadingJobs)).toBeTruthy();
    const cards = screen.getAllByTestId("discovered-job-skeleton-card");
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(within(card).getAllByTestId("dismissal-summary-skeleton", { includeHiddenElements: true })).toHaveLength(1);
      expect(within(card).getAllByTestId("button-row-skeleton")).toHaveLength(1);
    }

    await act(async () => answer?.(discoverPage([NEWER], { state: "dismissed", offset: 0, limit: 50 })));
    const loaded = await screen.findByTestId("discovered-job-j-newer");
    expect(within(loaded).getAllByTestId("dismissal-summary")).toHaveLength(1);
  });
});
