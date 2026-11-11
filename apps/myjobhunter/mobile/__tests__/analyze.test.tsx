import { ADD_APPLICATION_FORM_PROBLEMS, JD_TEXT_MAX_LENGTH, JOB_URL_MAX_LENGTH } from "@myjobhunter/api-client/constants/addApplicationForm";
import { ANALYZE_LONG_RUNNING_MS, JOB_ANALYSIS_ERRORS } from "@myjobhunter/api-client/constants/jobAnalysis";
import { DIMENSION_KEY_ORDER } from "@myjobhunter/api-client/constants/jobAnalysisDimensionKeys";
import { clearLastAnalysis } from "@myjobhunter/api-client/store/jobAnalysisSlice";
import { baseApi } from "@platform/core/store/baseApi";
import { DISCARD_MESSAGES } from "@platform/mobile";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { AccessibilityInfo, Alert, Linking } from "react-native";
import { ANALYZE_MESSAGES as MESSAGES } from "../src/constants/analyze";
import { store } from "../src/lib/store";
import { alertButton } from "../test-support/alertButton";
import { analysisRecord } from "../test-support/analysisRecord";
import { analyzeRoutes } from "../test-support/analyzeRoutes";
import { serve } from "../test-support/fakeServer";
import { heldReplies } from "../test-support/heldReplies";
import { storedItems } from "../test-support/memorySecureStore";
import { renderApp } from "../test-support/renderApp";
import { storeSession } from "../test-support/storedSession";
import type { FakeReply } from "../test-support/types/FakeReply";
import type { FakeRoute } from "../test-support/types/FakeRoute";

jest.mock("expo-secure-store", () => jest.requireActual("../test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("../test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("expo-clipboard", () => ({ getStringAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const ANALYZE = "POST /jobs/analyze";
const LINK = "https://jobs.example.com/posting/123";
const TIMEOUT = "The page took too long to load. Try again or paste the description text.";
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
const clipboard = jest.mocked(Clipboard.getStringAsync);
const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);

const ok = (data: unknown) => (): FakeReply => ({ status: 201, data });
const fail = (status: number, detail: unknown = "boom") => (): FakeReply => ({ status, data: { detail } });

function serveAnalyze(routes: Record<string, FakeRoute> = {}) {
  return serve(analyzeRoutes(routes));
}

/** Opens Analyze from More, as tapping it there does, so Back has somewhere to go. */
async function openFromMore(): Promise<void> {
  await renderApp("/more");
  await fireEvent.press(await screen.findByRole("button", { name: "Analyze a job" }));
  await screen.findByTestId("analyze");
}

function field(label: string) {
  return screen.getByLabelText(label);
}

async function chooseSource(label: string): Promise<void> {
  await fireEvent.press(screen.getByRole("tab", { name: label }));
}

async function analyzeLink(link = LINK): Promise<void> {
  await fireEvent.changeText(field(MESSAGES.linkLabel), link);
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.analyze }));
}

async function analyzeText(text: string): Promise<void> {
  await chooseSource("Paste text");
  await fireEvent.changeText(field(MESSAGES.textLabel), text);
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.analyze }));
}

/** Sends an analysis of LINK, goes back to More while it runs, then opens Analyze again. */
async function leaveAndComeBackMidWait(): Promise<void> {
  await openFromMore();
  await analyzeLink();
  await screen.findByTestId("analyze-progress");
  await act(async () => router.back());
  await waitFor(() => expect(screen).toHavePathname("/more"));
  await fireEvent.press(screen.getByRole("button", { name: "Analyze a job" }));
  await screen.findByTestId("analyze");
}

function requestsTo(sent: ReturnType<typeof serve>, route: string) {
  return sent.filter((request) => request.route === route);
}

beforeEach(() => {
  storedItems.clear();
  storeSession();
  alert.mockClear();
  announce.mockClear();
  openURL.mockClear();
  clipboard.mockReset();
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(clearLastAnalysis());
});

describe("getting there", () => {
  it("opens on the phone from More, not on the website", async () => {
    serveAnalyze();
    await openFromMore();

    expect(screen).toHavePathname("/analyze");
    expect(screen.getByRole("header", { name: MESSAGES.heading })).toBeTruthy();
    expect(screen.getByText(MESSAGES.intro)).toBeTruthy();
    expect(openURL).not.toHaveBeenCalled();
  });
});

describe("from a link", () => {
  it("analyzes the link, showing the wait the moment it's pressed, then the result", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    const sent = serveAnalyze({ [ANALYZE]: () => new Promise<FakeReply>((resolve) => (answer = resolve)) });
    await openFromMore();
    await analyzeLink(`  ${LINK}  `);

    expect(await screen.findByRole("header", { name: MESSAGES.readingLink })).toBeTruthy();
    expect(screen.getByText(MESSAGES.usualWait)).toBeTruthy();
    expect(screen.getAllByTestId("skeleton-analysis-dimension", { includeHiddenElements: true })).toHaveLength(5);
    expect(requestsTo(sent, ANALYZE).map(({ body }) => body)).toEqual([{ url: LINK }]);

    await act(async () => answer(ok(analysisRecord({ source_url: LINK }))()));
    expect(await screen.findByRole("header", { name: "Staff Engineer" })).toBeTruthy();
    expect(screen.queryByTestId("analysis-skeleton", { includeHiddenElements: true })).toBeNull();
  });

  it("says when it's slow after a few seconds", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    serveAnalyze({ [ANALYZE]: () => new Promise<FakeReply>((resolve) => (answer = resolve)) });
    await openFromMore();
    await analyzeLink();
    await screen.findByRole("header", { name: MESSAGES.readingLink });
    expect(screen.queryByText(MESSAGES.longRunning)).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(ANALYZE_LONG_RUNNING_MS);
    });
    expect(screen.getByRole("header", { name: MESSAGES.longRunning })).toBeTruthy();
    expect(screen.getByText(MESSAGES.longWait)).toBeTruthy();
    await act(async () => answer(ok(analysisRecord())()));
    await screen.findByTestId("verdict-card");
  });

  it("waits in the result's shape: caption, role, verdict, each dimension, both flag lists and the decision row", async () => {
    serveAnalyze({ [ANALYZE]: heldReplies().route });
    await openFromMore();
    await analyzeLink();
    const skeleton = within(await screen.findByTestId("analysis-skeleton", { includeHiddenElements: true }));
    const hidden = { includeHiddenElements: true };

    expect(skeleton.getByTestId("skeleton-analysis-caption", hidden)).toBeTruthy();
    expect(skeleton.getByTestId("skeleton-analysis-header", hidden)).toBeTruthy();
    expect(skeleton.getByTestId("skeleton-analysis-verdict", hidden)).toBeTruthy();
    expect(skeleton.getAllByTestId("skeleton-analysis-dimension", hidden)).toHaveLength(DIMENSION_KEY_ORDER.length);
    expect(skeleton.getAllByTestId("skeleton-analysis-flags", hidden)).toHaveLength(2);
    expect(within(skeleton.getByTestId("skeleton-analysis-actions", hidden)).getAllByTestId("skeleton-analysis-button", hidden)).toHaveLength(2);
  });

  it("reads the wait out once, with no live region to read it a second time", async () => {
    serveAnalyze({ [ANALYZE]: heldReplies().route });
    await openFromMore();
    await analyzeLink();
    const heading = await screen.findByRole("header", { name: MESSAGES.readingLink });

    expect(heading.props.accessibilityLiveRegion).toBeUndefined();
    expect(announce.mock.calls.filter(([message]) => message === MESSAGES.readingLink)).toHaveLength(1);
  });

  it("analyzes the link on the clipboard straight away", async () => {
    clipboard.mockResolvedValue(` ${LINK}\n`);
    const sent = serveAnalyze({ [ANALYZE]: ok(analysisRecord()) });
    await openFromMore();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.pasteLink }));

    await screen.findByTestId("verdict-card");
    expect(requestsTo(sent, ANALYZE).map(({ body }) => body)).toEqual([{ url: LINK }]);
  });

  it("sends one analysis when Analyze is pressed while Paste is still reading the clipboard", async () => {
    let read: (text: string) => void = () => undefined;
    clipboard.mockImplementation(() => new Promise<string>((resolve) => (read = resolve)));
    const held = heldReplies();
    const sent = serveAnalyze({ [ANALYZE]: held.route });
    await openFromMore();
    await fireEvent.changeText(field(MESSAGES.linkLabel), LINK);

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.pasteLink }));
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.analyze }));
    await screen.findByTestId("analyze-progress");
    await act(async () => read("https://jobs.example.com/posting/456"));

    expect(requestsTo(sent, ANALYZE).map(({ body }) => body)).toEqual([{ url: LINK }]);
    await held.answer(0, ok(analysisRecord())());
    await screen.findByTestId("verdict-card");
  });

  it("says when the clipboard is empty or can't be read, sending nothing", async () => {
    const sent = serveAnalyze();
    await openFromMore();
    clipboard.mockResolvedValue("  ");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.pasteLink }));
    expect(await screen.findByText(MESSAGES.noLinkOnClipboard)).toBeTruthy();

    clipboard.mockRejectedValue(new Error("denied"));
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.pasteLink }));
    expect(await screen.findByText(MESSAGES.couldntReadClipboard)).toBeTruthy();
    expect(requestsTo(sent, ANALYZE)).toHaveLength(0);
  });

  it("won't send something that isn't a link, or one too long to read, keeping what was typed", async () => {
    const sent = serveAnalyze();
    await openFromMore();
    await analyzeLink("jobs at stripe");
    expect(await screen.findByText(MESSAGES.notALink)).toBeTruthy();

    const tooLong = `https://jobs.example.com/${"a".repeat(JOB_URL_MAX_LENGTH)}`;
    await analyzeLink(tooLong);
    expect(await screen.findByText(ADD_APPLICATION_FORM_PROBLEMS.jobUrlTooLong)).toBeTruthy();
    expect(field(MESSAGES.linkLabel).props.value).toBe(tooLong);
    expect(requestsTo(sent, ANALYZE)).toHaveLength(0);
  });

  it("moves to pasting the text when the link needs a sign-in, saying why until the link tab is chosen again", async () => {
    serveAnalyze({ [ANALYZE]: fail(422, "auth_required") });
    await openFromMore();
    await analyzeLink();

    expect(await screen.findByText(MESSAGES.linkBlocked)).toBeTruthy();
    expect(field(MESSAGES.textLabel)).toBeTruthy();
    await chooseSource("Link");
    expect(screen.queryByText(MESSAGES.linkBlocked)).toBeNull();
    expect(field(MESSAGES.linkLabel).props.value).toBe(LINK);
  });

  it.each([
    [504, TIMEOUT],
    [502, "Couldn't extract the job description from that page. Paste the description text instead."],
    [429, "You've looked up a lot of job postings recently. Try again in a few minutes."],
    [400, "That URL doesn't look right. Make sure it starts with http:// or https://."],
  ])("says why a %s failed, and keeps the link to try again", async (status, why) => {
    serveAnalyze({ [ANALYZE]: fail(status) });
    await openFromMore();
    await analyzeLink();

    expect(await screen.findByText(`${MESSAGES.couldntAnalyze} ${why}`)).toBeTruthy();
    expect(field(MESSAGES.linkLabel).props.value).toBe(LINK);
  });
});

describe("from pasted text", () => {
  it("analyzes the trimmed text, saying so while it waits", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    const sent = serveAnalyze({ [ANALYZE]: () => new Promise<FakeReply>((resolve) => (answer = resolve)) });
    await openFromMore();
    await analyzeText("  Staff Engineer at Stripe.  ");

    expect(await screen.findByRole("header", { name: MESSAGES.analyzingText })).toBeTruthy();
    expect(requestsTo(sent, ANALYZE).map(({ body }) => body)).toEqual([{ jd_text: "Staff Engineer at Stripe." }]);
    await act(async () => answer(ok(analysisRecord())()));
    await screen.findByTestId("verdict-card");
  });

  it("says when the description is too long, keeping all of it, and won't send it", async () => {
    const sent = serveAnalyze();
    await openFromMore();
    await chooseSource("Paste text");
    const tooLong = "a".repeat(JD_TEXT_MAX_LENGTH + 1);
    await fireEvent.changeText(field(MESSAGES.textLabel), tooLong);

    expect(screen.getByText(ADD_APPLICATION_FORM_PROBLEMS.jdTextTooLong)).toBeTruthy();
    expect(field(MESSAGES.textLabel).props.value).toBe(tooLong);
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.analyze }));
    expect(requestsTo(sent, ANALYZE)).toHaveLength(0);
  });

  it.each([
    [429, "You've looked up a lot of job postings recently. Try again in a few minutes."],
    [502, JOB_ANALYSIS_ERRORS.aiFailed],
    [500, JOB_ANALYSIS_ERRORS.failed],
  ])("says why a %s failed without the server's raw detail, keeping the text", async (status, why) => {
    serveAnalyze({ [ANALYZE]: fail(status, "Couldn't analyze this job: Error code: 529 overloaded_error") });
    await openFromMore();
    await analyzeText("Staff Engineer at Stripe.");

    expect(await screen.findByText(`${MESSAGES.couldntAnalyze} ${why}`)).toBeTruthy();
    expect(screen.queryByText(/overloaded_error/)).toBeNull();
    expect(field(MESSAGES.textLabel).props.value).toBe("Staff Engineer at Stripe.");
  });
});

describe("cancelling", () => {
  it("goes back to what was entered, and ignores the answer when it comes", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    serveAnalyze({ [ANALYZE]: () => new Promise<FakeReply>((resolve) => (answer = resolve)) });
    await openFromMore();
    await analyzeLink();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.cancel }));

    expect(field(MESSAGES.linkLabel).props.value).toBe(LINK);
    expect(screen.queryByTestId("analyze-progress")).toBeNull();
    await act(async () => answer(ok(analysisRecord())()));
    expect(screen.queryByTestId("verdict-card")).toBeNull();
    expect(store.getState().jobAnalysis.lastResult).toBeNull();
    expect(screen.queryByText(new RegExp(MESSAGES.couldntAnalyze))).toBeNull();
  });
});

describe("leaving", () => {
  it("goes straight back when nothing has been entered", async () => {
    serveAnalyze();
    await openFromMore();
    await act(async () => router.back());

    expect(screen).toHavePathname("/more");
    expect(alert).not.toHaveBeenCalled();
  });

  it("asks before throwing away a typed link, keeping it on Keep editing and leaving on Discard", async () => {
    serveAnalyze();
    await openFromMore();
    await fireEvent.changeText(field(MESSAGES.linkLabel), LINK);

    await act(async () => router.back());
    expect(alert).toHaveBeenLastCalledWith(DISCARD_MESSAGES.discardTitle, DISCARD_MESSAGES.discardBody, expect.any(Array));
    await act(async () => alertButton(DISCARD_MESSAGES.keepEditing).onPress?.());
    expect(screen).toHavePathname("/analyze");
    expect(field(MESSAGES.linkLabel).props.value).toBe(LINK);

    await act(async () => router.back());
    await act(async () => alertButton(DISCARD_MESSAGES.discard).onPress?.());
    await waitFor(() => expect(screen).toHavePathname("/more"));
  });

  it("lets an analysis run on when left, and shows its result on coming back, as the website does", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    const sent = serveAnalyze({ [ANALYZE]: () => new Promise<FakeReply>((resolve) => (answer = resolve)) });
    await openFromMore();
    await analyzeLink();
    await screen.findByTestId("analyze-progress");

    await act(async () => router.back());
    expect(alert).not.toHaveBeenCalled();
    await waitFor(() => expect(screen).toHavePathname("/more"));
    await act(async () => answer(ok(analysisRecord())()));

    await fireEvent.press(screen.getByRole("button", { name: "Analyze a job" }));
    expect(await screen.findByTestId("verdict-card")).toBeTruthy();
    expect(requestsTo(sent, ANALYZE)).toHaveLength(1);
  });
});

describe("opening it again while the analysis runs", () => {
  it("shows the wait, with Cancel, then the result when it lands", async () => {
    const held = heldReplies();
    serveAnalyze({ [ANALYZE]: held.route });
    await leaveAndComeBackMidWait();

    expect(screen.getByTestId("analyze-progress")).toBeTruthy();
    expect(screen.getByRole("header", { name: MESSAGES.readingLink })).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.cancel })).toBeTruthy();
    expect(screen.queryByLabelText(MESSAGES.linkLabel)).toBeNull();

    await held.answer(0, ok(analysisRecord())());
    expect(await screen.findByTestId("verdict-card")).toBeTruthy();
  });

  it("keeps the newer analysis when the one sent before leaving answers after it", async () => {
    const held = heldReplies();
    const sent = serveAnalyze({ [ANALYZE]: held.route });
    await leaveAndComeBackMidWait();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.cancel }));
    await analyzeLink("https://jobs.example.com/posting/456");
    await screen.findByTestId("analyze-progress");

    await held.answer(0, ok(analysisRecord({ id: "an-older", extracted: { ...analysisRecord().extracted, title: "Older role" } }))());
    expect(screen.getByTestId("analyze-progress")).toBeTruthy();
    expect(screen.queryByText("Older role")).toBeNull();

    await held.answer(1, ok(analysisRecord({ id: "an-newer", extracted: { ...analysisRecord().extracted, title: "Newer role" } }))());
    expect(await screen.findByRole("header", { name: "Newer role" })).toBeTruthy();
    expect(store.getState().jobAnalysis.lastResult?.id).toBe("an-newer");
    expect(requestsTo(sent, ANALYZE)).toHaveLength(2);
  });

  it("leaves what's being typed alone when the cancelled analysis answers", async () => {
    const held = heldReplies();
    serveAnalyze({ [ANALYZE]: held.route });
    await leaveAndComeBackMidWait();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.cancel }));
    await fireEvent.changeText(field(MESSAGES.linkLabel), "https://jobs.example.com/posting/789");

    await held.answer(0, ok(analysisRecord())());
    expect(screen.queryByTestId("verdict-card")).toBeNull();
    expect(field(MESSAGES.linkLabel).props.value).toBe("https://jobs.example.com/posting/789");
    expect(store.getState().jobAnalysis.lastResult).toBeNull();

    // What's typed is still asked about before it's thrown away.
    await act(async () => router.back());
    expect(alert).toHaveBeenLastCalledWith(DISCARD_MESSAGES.discardTitle, DISCARD_MESSAGES.discardBody, expect.any(Array));
  });

  it("says it's taking longer than usual straight away when opened again after that, never the usual wait", async () => {
    const held = heldReplies();
    serveAnalyze({ [ANALYZE]: held.route });
    await openFromMore();
    await analyzeLink();
    await screen.findByTestId("analyze-progress");
    await act(async () => router.back());
    await waitFor(() => expect(screen).toHavePathname("/more"));
    await act(async () => {
      jest.advanceTimersByTime(ANALYZE_LONG_RUNNING_MS + 1);
    });
    announce.mockClear();

    await fireEvent.press(screen.getByRole("button", { name: "Analyze a job" }));
    expect(await screen.findByRole("header", { name: MESSAGES.longRunning })).toBeTruthy();
    expect(screen.queryByText(MESSAGES.usualWait)).toBeNull();
    expect(announce).not.toHaveBeenCalledWith(MESSAGES.readingLink);
    expect(announce).toHaveBeenCalledWith(MESSAGES.longRunning);
  });

  it("moves to pasting the text when the link sent before leaving needs a sign-in", async () => {
    const held = heldReplies();
    serveAnalyze({ [ANALYZE]: held.route });
    await leaveAndComeBackMidWait();

    await held.answer(0, fail(422, "auth_required")());
    expect(await screen.findByText(MESSAGES.linkBlocked)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Paste text", selected: true })).toBeTruthy();
    expect(field(MESSAGES.textLabel)).toBeTruthy();
    await chooseSource("Link");
    expect(screen.queryByText(MESSAGES.linkBlocked)).toBeNull();
    expect(field(MESSAGES.linkLabel)).toBeTruthy();
  });

  it("says why on opening it again when it failed while no Analyze screen was open, then only once", async () => {
    const held = heldReplies();
    serveAnalyze({ [ANALYZE]: held.route });
    await openFromMore();
    await analyzeLink();
    await screen.findByTestId("analyze-progress");
    await act(async () => router.back());
    await waitFor(() => expect(screen).toHavePathname("/more"));
    await held.answer(0, fail(504)());

    await fireEvent.press(screen.getByRole("button", { name: "Analyze a job" }));
    expect(await screen.findByText(`${MESSAGES.couldntAnalyze} ${TIMEOUT}`)).toBeTruthy();
    await act(async () => router.back());
    await waitFor(() => expect(screen).toHavePathname("/more"));
    await fireEvent.press(screen.getByRole("button", { name: "Analyze a job" }));
    await screen.findByTestId("analyze");
    expect(screen.queryByText(new RegExp(MESSAGES.couldntAnalyze))).toBeNull();
  });

  it("says nothing when the analysis cancelled on the reopened screen fails afterwards", async () => {
    const held = heldReplies();
    serveAnalyze({ [ANALYZE]: held.route });
    await leaveAndComeBackMidWait();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.cancel }));

    await held.answer(0, fail(504)());
    expect(screen.queryByText(new RegExp(MESSAGES.couldntAnalyze))).toBeNull();
    expect(store.getState().jobAnalysis.failure).toBeNull();
  });

  it("says why when it fails after the screen it was sent from has gone", async () => {
    const held = heldReplies();
    serveAnalyze({ [ANALYZE]: held.route });
    await leaveAndComeBackMidWait();

    await held.answer(0, fail(504)());
    expect(await screen.findByText(`${MESSAGES.couldntAnalyze} ${TIMEOUT}`)).toBeTruthy();
    expect(screen.queryByTestId("analyze-progress")).toBeNull();
    expect(field(MESSAGES.linkLabel)).toBeTruthy();
  });
});

// Signing out ends the app's session for the rest of this file, so this runs last.
describe("signing out mid-analysis", () => {
  it("drops the analysis still running, so its answer never reaches the next account", async () => {
    const held = heldReplies();
    serveAnalyze({ [ANALYZE]: held.route, "POST /auth/mobile/logout": () => ({ status: 204 }) });
    await openFromMore();
    await analyzeLink();
    await screen.findByTestId("analyze-progress");
    await act(async () => router.back());
    await waitFor(() => expect(screen).toHavePathname("/more"));

    await fireEvent.press(await screen.findByRole("button", { name: "Sign out of this phone" }));
    await screen.findByLabelText("Password");
    expect(store.getState().jobAnalysis.pending).toBeNull();

    await held.answer(0, ok(analysisRecord())());
    expect(store.getState().jobAnalysis).toEqual({ lastResult: null, pending: null, failure: null });
  });
});
