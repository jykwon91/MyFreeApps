import { clearLastAnalysis } from "@myjobhunter/api-client/store/jobAnalysisSlice";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { router } from "expo-router";
import { AccessibilityInfo, Linking, StyleSheet } from "react-native";
import { ANALYZE_MESSAGES as MESSAGES } from "../src/constants/analyze";
import { store } from "../src/lib/store";
import { analysisRecord } from "../test-support/analysisRecord";
import { analyzeRoutes } from "../test-support/analyzeRoutes";
import { applicationRecord } from "../test-support/applicationRecord";
import { serve } from "../test-support/fakeServer";
import { storedItems } from "../test-support/memorySecureStore";
import { rememberAnalysis } from "../test-support/rememberAnalysis";
import { renderApp } from "../test-support/renderApp";
import { storeSession } from "../test-support/storedSession";
import type { JobAnalysisVerdict } from "@myjobhunter/api-client/types/job-analysis/job-analysis-verdict";
import type { FakeReply } from "../test-support/types/FakeReply";
import type { FakeRoute } from "../test-support/types/FakeRoute";

jest.mock("expo-secure-store", () => jest.requireActual("../test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("../test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const ANALYZE = "POST /jobs/analyze";
const APPLY = "POST /jobs/analyze/an-1/apply";
const LINK = "https://jobs.example.com/posting/123";
const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);

function serveResult(routes: Record<string, FakeRoute> = {}) {
  return serve(analyzeRoutes(routes));
}

/** Analyzes `LINK`, answered with `analysis`, from Analyze opened on top of More. */
async function showResult(analysis = analysisRecord({ source_url: LINK }), routes: Record<string, FakeRoute> = {}) {
  const sent = serveResult({ [ANALYZE]: () => ({ status: 201, data: analysis }), ...routes });
  await renderApp("/more");
  await fireEvent.press(await screen.findByRole("button", { name: "Analyze a job" }));
  await fireEvent.changeText(await screen.findByLabelText(MESSAGES.linkLabel), LINK);
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.analyze }));
  await screen.findByTestId("verdict-card");
  return sent;
}

function requestsTo(sent: ReturnType<typeof serve>, route: string) {
  return sent.filter((request) => request.route === route);
}

beforeEach(() => {
  storedItems.clear();
  storeSession();
  openURL.mockClear();
  announce.mockClear();
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(clearLastAnalysis());
});

describe("the result", () => {
  it("shows the role, its company and location, and opens the posting it came from", async () => {
    await showResult();

    expect(screen.getByText(MESSAGES.analyzedAgainst)).toBeTruthy();
    expect(screen.getByRole("header", { name: "Staff Engineer" })).toBeTruthy();
    expect(screen.getByText("Stripe")).toBeTruthy();
    expect(screen.getByText(/Seattle, WA/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("link", { name: LINK }));
    expect(openURL).toHaveBeenLastCalledWith(LINK);
  });

  it("shows the verdict and why, and reads both out as one", async () => {
    await showResult();
    const verdict = screen.getByTestId("verdict-card");

    expect(verdict.props.accessibilityLabel).toBe(
      `${MESSAGES.verdictHeading}: Worth considering. Skills line up; the salary is below your floor.`,
    );
    expect(within(verdict).getByText("Worth considering", { includeHiddenElements: true })).toBeTruthy();
  });

  it("is toned by the verdict, as the website's banner is", async () => {
    await showResult(analysisRecord({ verdict: "mismatch" }));
    const card = StyleSheet.flatten(screen.getByTestId("verdict-card").props.style);
    // The red flags' chip is in the danger tone, as a mismatch is.
    const redChip = screen.getAllByTestId("chip").find((chip) => within(chip).queryByText(MESSAGES.redFlags));
    const danger = StyleSheet.flatten(redChip?.props.style).backgroundColor;

    expect(card.backgroundColor).toBe(danger);
    expect(within(screen.getByTestId("verdict-card")).getByText("Mismatch", { includeHiddenElements: true })).toBeTruthy();
  });

  it("says only Analyzed for a verdict this build doesn't know, as the website does", async () => {
    await showResult(analysisRecord({ verdict: "surprising_fit" as JobAnalysisVerdict }));
    const verdict = screen.getByTestId("verdict-card");

    expect(verdict.props.accessibilityLabel).toBe(`${MESSAGES.verdictHeading}: Analyzed. Skills line up; the salary is below your floor.`);
    expect(within(verdict).queryByText("surprising_fit", { includeHiddenElements: true })).toBeNull();
  });

  it("reads the verdict out when it arrives, but not again on coming back to it", async () => {
    await showResult();
    const verdictRead = `${MESSAGES.verdictHeading}: Worth considering`;
    expect(announce).toHaveBeenCalledWith(verdictRead);

    announce.mockClear();
    await act(async () => router.back());
    await waitFor(() => expect(screen).toHavePathname("/more"));
    await fireEvent.press(screen.getByRole("button", { name: "Analyze a job" }));
    await screen.findByTestId("verdict-card");
    expect(announce).not.toHaveBeenCalledWith(verdictRead);
  });

  it("lists every dimension in the rubric's order, with its status and why", async () => {
    await showResult();
    expect(screen.getByRole("header", { name: MESSAGES.dimensionsHeading })).toBeTruthy();

    const cards = screen.getAllByTestId("dimension-card").map((card) => within(card));
    expect(cards.map((card) => card.getAllByText(/./)[0]?.props.children)).toEqual([
      "Skill match",
      "Seniority",
      "Salary",
      "Location & remote",
      "Work authorization",
    ]);
    expect(cards[0]?.getByText("Strong")).toBeTruthy();
    expect(cards[0]?.getByText("Go and Postgres covered.")).toBeTruthy();
    expect(cards[2]?.getByText("Below target")).toBeTruthy();
    expect(cards[3]?.getByText("Stretch")).toBeTruthy();
  });

  it("shows the red and green flags", async () => {
    await showResult();
    expect(screen.getByText(MESSAGES.redFlags)).toBeTruthy();
    expect(screen.getByText("On-call every other week")).toBeTruthy();
    expect(screen.getByText(MESSAGES.greenFlags)).toBeTruthy();
    expect(screen.getByText("Learning budget")).toBeTruthy();
  });

  it("fills in what Claude didn't find, shows a dimension it doesn't know at the end, and leaves out empty flags", async () => {
    await showResult(
      analysisRecord({
        extracted: { ...analysisRecord().extracted, title: null, company: " ", location: null },
        dimensions: [{ key: "culture", status: "sideways", rationale: "" }, { key: "salary", status: "in_range", rationale: "Fits." }],
        red_flags: [],
        green_flags: [],
      }),
    );

    expect(screen.getByRole("header", { name: "Untitled role" })).toBeTruthy();
    expect(screen.getByText("Unknown company")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    const cards = screen.getAllByTestId("dimension-card").map((card) => within(card));
    expect(cards[0]?.getByText("Salary")).toBeTruthy();
    expect(cards[1]?.getByText("culture")).toBeTruthy();
    expect(cards[1]?.getByText("sideways")).toBeTruthy();
    expect(cards[1]?.getByText(MESSAGES.noRationale)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.redFlags)).toBeNull();
    expect(screen.queryByText(MESSAGES.greenFlags)).toBeNull();
  });

  it("says so when there are no dimensions", async () => {
    await showResult(analysisRecord({ dimensions: [] }));
    expect(screen.getByText(MESSAGES.noDimensions)).toBeTruthy();
  });

  it("shows a stored source that isn't http or https as text it won't open", async () => {
    await showResult(analysisRecord({ source_url: "javascript:alert(1)" }));
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("javascript:alert(1)")).toBeTruthy();
  });

  it("is still there on coming back, without another analysis", async () => {
    const sent = await showResult();
    await act(async () => router.back());
    await waitFor(() => expect(screen).toHavePathname("/more"));

    await fireEvent.press(screen.getByRole("button", { name: "Analyze a job" }));
    expect(await screen.findByTestId("verdict-card")).toBeTruthy();
    expect(requestsTo(sent, ANALYZE)).toHaveLength(1);
  });
});

describe("adding it to applications", () => {
  it("says what adding does, shows it's adding the moment it's pressed, adds it once, and opens the applications", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    const sent = await showResult(undefined, { [APPLY]: () => new Promise<FakeReply>((resolve) => (answer = resolve)) });
    expect(screen.getByText(MESSAGES.bridge)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.addToApplications }));
    const adding = await screen.findByRole("button", { name: MESSAGES.adding });
    await fireEvent.press(adding);
    expect(requestsTo(sent, APPLY)).toHaveLength(1);
    expect(screen.getByRole("button", { name: MESSAGES.analyzeAnother }).props.accessibilityState).toMatchObject({ disabled: true });

    await act(async () => answer({ status: 201, data: applicationRecord({ id: "app-new" }) }));
    expect(await screen.findByText(MESSAGES.added)).toBeTruthy();
    await waitFor(() => expect(screen).toHavePathname("/applications"));
    expect(store.getState().jobAnalysis.lastResult?.applied_application_id).toBe("app-new");
  });

  it("says it's saved on coming back, offering the applications instead of adding it again", async () => {
    await showResult(undefined, { [APPLY]: () => ({ status: 201, data: applicationRecord({ id: "app-new" }) }) });
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.addToApplications }));
    await waitFor(() => expect(screen).toHavePathname("/applications"));

    await act(async () => router.push("/analyze"));
    expect(await screen.findByText(MESSAGES.saved)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.addToApplications })).toBeNull();
    expect(screen.queryByText(MESSAGES.bridge)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.viewApplications }));
    await waitFor(() => expect(screen).toHavePathname("/applications"));
  });

  it("says when adding failed, staying on the result to try again", async () => {
    let failApply = true;
    const sent = await showResult(undefined, {
      [APPLY]: () => (failApply ? { status: 500, data: { detail: "boom" } } : { status: 201, data: applicationRecord({ id: "app-new" }) }),
    });
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.addToApplications }));

    expect(await screen.findByText(MESSAGES.couldntAdd)).toBeTruthy();
    expect(screen).toHavePathname("/analyze");
    expect(store.getState().jobAnalysis.lastResult?.applied_application_id).toBeNull();

    failApply = false;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.addToApplications }));
    await waitFor(() => expect(screen).toHavePathname("/applications"));
    expect(requestsTo(sent, APPLY)).toHaveLength(2);
  });
});

describe("analyzing another", () => {
  it("clears the result and what was entered, back on the link", async () => {
    await showResult();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.analyzeAnother }));

    expect((await screen.findByLabelText(MESSAGES.linkLabel)).props.value).toBe("");
    expect(screen.queryByTestId("verdict-card")).toBeNull();
    expect(store.getState().jobAnalysis.lastResult).toBeNull();
  });
});

// Signing out ends the app's session for the rest of this file, so this runs last.
describe("signing out", () => {
  it("drops the last result, so the next account never sees it", async () => {
    rememberAnalysis(analysisRecord());
    serveResult({ "POST /auth/mobile/logout": () => ({ status: 204 }) });
    await renderApp("/more");
    await fireEvent.press(await screen.findByRole("button", { name: "Sign out of this phone" }));

    await screen.findByLabelText("Password");
    expect(store.getState().jobAnalysis.lastResult).toBeNull();
  });
});
