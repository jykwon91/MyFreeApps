import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Linking } from "react-native";
import { COMPANY_RESEARCH_MESSAGES as MESSAGES } from "../src/constants/companyResearch";
import { formatShortDate } from "../src/lib/formatShortDate";
import { store } from "../src/lib/store";
import { companyDetailRoutes } from "../test-support/companyDetailRoutes";
import { companyRecord } from "../test-support/companyRecord";
import { serve } from "../test-support/fakeServer";
import { storedItems } from "../test-support/memorySecureStore";
import { renderCompanyDetail } from "../test-support/renderCompanyDetail";
import { researchRecord } from "../test-support/researchRecord";
import { storeSession } from "../test-support/storedSession";
import type { FakeReply } from "../test-support/types/FakeReply";
import type { SentRequest } from "../test-support/types/SentRequest";

jest.mock("expo-secure-store", () => jest.requireActual("../test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("../test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo-router", () => jest.requireActual("../test-support/mockExpoRouter").mockExpoRouter);

const ID = "c-acme";
const ACME = companyRecord({ id: ID, name: "Acme Corp" });
const FULL = researchRecord({
  company_id: ID,
  overall_sentiment: "positive",
  description: "Builds workflow software.",
  products_for_you: "Your distributed-systems work fits their core.",
  interview_process: "Three rounds, well organised.",
  senior_engineer_sentiment: "Collaborative and fast-paced.",
  raw_synthesis: { compensation_signals: "Above-market base with equity refresh." },
  green_flags: ["Competitive pay", "Strong engineering culture"],
  red_flags: ["Slow promotions"],
  last_researched_at: "2026-10-20T12:00:00Z",
  sources: [
    {
      id: "s1",
      company_research_id: `r-${ID}`,
      url: "https://glassdoor.com/acme",
      title: "Acme reviews",
      snippet: "People like it here.",
      source_type: "review",
      fetched_at: "2026-10-20T12:00:00Z",
      created_at: "2026-10-20T12:00:00Z",
    },
    {
      id: "s2",
      company_research_id: `r-${ID}`,
      url: "https://levels.fyi/acme",
      title: null,
      snippet: null,
      source_type: "comp",
      fetched_at: "2026-10-20T12:00:00Z",
      created_at: "2026-10-20T12:00:00Z",
    },
    {
      id: "s3",
      company_research_id: `r-${ID}`,
      url: "javascript:alert(document.cookie)",
      title: "Sketchy page",
      snippet: null,
      source_type: "web",
      fetched_at: "2026-10-20T12:00:00Z",
      created_at: "2026-10-20T12:00:00Z",
    },
    {
      id: "s4",
      company_research_id: `r-${ID}`,
      url: "intent://scan/#Intent;scheme=zxing;package=com.evil;end",
      title: null,
      snippet: "An app link.",
      source_type: "web",
      fetched_at: "2026-10-20T12:00:00Z",
      created_at: "2026-10-20T12:00:00Z",
    },
  ],
});

const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);

const runs = (sent: SentRequest[]) => sent.filter(({ route }) => route === `POST /companies/${ID}/research`);
const research = () => within(screen.getByTestId("company-research"));

beforeEach(() => {
  storedItems.clear();
  storeSession();
  jest.clearAllMocks();
  store.dispatch(baseApi.util.resetApiState());
});

it("shows where the research will be while it loads, rather than offering a run it may not need", async () => {
  let answer: () => void = () => undefined;
  serve({
    ...companyDetailRoutes(ACME),
    [`GET /companies/${ID}/research`]: () => new Promise<FakeReply>((resolve) => (answer = () => resolve({ status: 200, data: FULL }))),
  });
  await renderCompanyDetail(ID);
  await screen.findByRole("header", { name: "Acme Corp" });

  expect(research().getByLabelText(MESSAGES.loading)).toBeTruthy();
  expect(research().queryByRole("button", { name: MESSAGES.run })).toBeNull();
  await act(async () => answer());
  expect(await research().findByText("Positive")).toBeTruthy();
});

it("offers a run when there's none, shows it working from the press, then shows the result and says it's ready", async () => {
  let researched = false;
  let answer: () => void = () => undefined;
  const sent = serve({
    ...companyDetailRoutes(ACME),
    [`GET /companies/${ID}/research`]: () => (researched ? { status: 200, data: FULL } : { status: 404, data: { detail: "No research" } }),
    [`POST /companies/${ID}/research`]: () =>
      new Promise<FakeReply>(
        (resolve) =>
          (answer = () => {
            researched = true;
            resolve({ status: 200, data: FULL });
          }),
      ),
  });
  await renderCompanyDetail(ID);

  expect(await research().findByText(MESSAGES.noneBody)).toBeTruthy();
  await fireEvent.press(research().getByRole("button", { name: MESSAGES.run }));

  // A run takes up to half a minute: the button is busy at once, with a note and a skeleton.
  expect(research().getByRole("button", { name: MESSAGES.running }).props.accessibilityState).toEqual(expect.objectContaining({ busy: true }));
  expect(research().getByText(MESSAGES.runningNote("Acme Corp"))).toBeTruthy();
  expect(runs(sent)).toHaveLength(1);

  await act(async () => answer());
  expect(await screen.findByText(MESSAGES.ready)).toBeTruthy();
  expect(await research().findByText("Positive")).toBeTruthy();
  expect(research().getByText(MESSAGES.lastRun(formatShortDate("2026-10-20T12:00:00Z")))).toBeTruthy();
  for (const text of [
    "Builds workflow software.",
    "Your distributed-systems work fits their core.",
    "Three rounds, well organised.",
    "Collaborative and fast-paced.",
    "Above-market base with equity refresh.",
    "Competitive pay",
    "Strong engineering culture",
    "Slow promotions",
  ]) {
    expect(research().getByText(text)).toBeTruthy();
  }
  for (const heading of [MESSAGES.whatTheyDo, MESSAGES.productsForYou, MESSAGES.summary, MESSAGES.culture, MESSAGES.compensation]) {
    expect(research().getByRole("header", { name: heading.toUpperCase() })).toBeTruthy();
  }
  expect(research().getByText(MESSAGES.greenFlags)).toBeTruthy();
  expect(research().getByText(MESSAGES.redFlags)).toBeTruthy();
});

it("keeps the sources closed until asked, and opens each one", async () => {
  serve(companyDetailRoutes(ACME, { research: FULL }));
  await renderCompanyDetail(ID);

  const toggle = await research().findByRole("button", { name: MESSAGES.sources(4) });
  expect(toggle.props.accessibilityState).toEqual(expect.objectContaining({ expanded: false }));
  expect(research().queryByRole("link", { name: "Acme reviews" })).toBeNull();

  await fireEvent.press(toggle);
  expect(research().getByRole("button", { name: MESSAGES.sources(4) }).props.accessibilityState).toEqual(expect.objectContaining({ expanded: true }));
  expect(research().getByText("People like it here.")).toBeTruthy();
  await fireEvent.press(research().getByRole("link", { name: "Acme reviews" }));
  expect(openURL).toHaveBeenLastCalledWith("https://glassdoor.com/acme");
  // A source with no title shows its address.
  await fireEvent.press(research().getByRole("link", { name: "https://levels.fyi/acme" }));
  expect(openURL).toHaveBeenLastCalledWith("https://levels.fyi/acme");

  // Anything but http or https shows as plain text: not a link, and nothing to press.
  expect(research().getByText("Sketchy page")).toBeTruthy();
  expect(research().getByText("intent://scan/#Intent;scheme=zxing;package=com.evil;end")).toBeTruthy();
  expect(research().getAllByTestId("research-source-text")).toHaveLength(2);
  expect(research().queryByRole("link", { name: "Sketchy page" })).toBeNull();
  expect(research().queryByRole("link", { name: /^intent:/ })).toBeNull();
  expect(research().getAllByRole("link")).toHaveLength(2);
  expect(openURL).not.toHaveBeenCalledWith(expect.stringMatching(/^(javascript|intent):/));

  await fireEvent.press(research().getByRole("button", { name: MESSAGES.sources(4) }));
  expect(research().queryByRole("link", { name: "Acme reviews" })).toBeNull();
});

it("leaves out what a run didn't find", async () => {
  serve(companyDetailRoutes(ACME, { research: researchRecord({ company_id: ID, overall_sentiment: "mixed" }) }));
  await renderCompanyDetail(ID);

  expect(await research().findByText("Mixed")).toBeTruthy();
  expect(research().queryByRole("header", { name: MESSAGES.whatTheyDo.toUpperCase() })).toBeNull();
  expect(research().queryByText(MESSAGES.greenFlags)).toBeNull();
  expect(research().queryByRole("button", { name: MESSAGES.sources(0) })).toBeNull();
  expect(research().queryByText(/^Last run/)).toBeNull();
});

it("runs the research again from a result", async () => {
  const RERUN = { ...FULL, overall_sentiment: "negative" as const };
  let current = FULL;
  const sent = serve({
    ...companyDetailRoutes(ACME),
    [`GET /companies/${ID}/research`]: () => ({ status: 200, data: current }),
    [`POST /companies/${ID}/research`]: () => {
      current = RERUN;
      return { status: 200, data: RERUN };
    },
  });
  await renderCompanyDetail(ID);

  await fireEvent.press(await research().findByRole("button", { name: MESSAGES.rerun }));
  expect(await research().findByText("Negative")).toBeTruthy();
  expect(screen.getByText(MESSAGES.ready)).toBeTruthy();
  expect(runs(sent)).toHaveLength(1);
});

it("says when a run fails, and runs it again on Try again", async () => {
  let fails = true;
  let researched = false;
  const sent = serve({
    ...companyDetailRoutes(ACME),
    [`GET /companies/${ID}/research`]: () => (researched ? { status: 200, data: FULL } : { status: 404 }),
    [`POST /companies/${ID}/research`]: () => {
      if (fails) return { status: 502, data: { detail: "AI synthesis failed" } };
      researched = true;
      return { status: 200, data: FULL };
    },
  });
  await renderCompanyDetail(ID);

  await fireEvent.press(await research().findByRole("button", { name: MESSAGES.run }));
  expect(await screen.findByText(MESSAGES.couldntRun)).toBeTruthy();
  expect(research().getByText(MESSAGES.failedBody)).toBeTruthy();
  // The server's reason, as the website shows it.
  expect(research().getByText("AI synthesis failed")).toBeTruthy();

  fails = false;
  await fireEvent.press(research().getByRole("button", { name: MESSAGES.tryAgain }));
  expect(await research().findByText("Positive")).toBeTruthy();
  expect(runs(sent)).toHaveLength(2);
});

it("says when the company was deleted while a run was asked for, without offering to try again", async () => {
  serve({ ...companyDetailRoutes(ACME), [`POST /companies/${ID}/research`]: () => ({ status: 404, data: { detail: "Company not found" } }) });
  await renderCompanyDetail(ID);

  await fireEvent.press(await research().findByRole("button", { name: MESSAGES.run }));
  // In a toast, and where the research would be.
  await waitFor(() => expect(screen.getAllByText(MESSAGES.gone)).toHaveLength(2));
  expect(research().getByText(MESSAGES.gone)).toBeTruthy();
  expect(research().queryByRole("button", { name: MESSAGES.tryAgain })).toBeNull();
});

it("says research isn't set up when the server has no search key, with its reason and no retry that can't work", async () => {
  const sent = serve({
    ...companyDetailRoutes(ACME),
    [`POST /companies/${ID}/research`]: () => ({ status: 503, data: { detail: "Tavily research is not configured: TAVILY_API_KEY is empty" } }),
  });
  await renderCompanyDetail(ID);

  await fireEvent.press(await research().findByRole("button", { name: MESSAGES.run }));
  expect(await research().findByText(MESSAGES.notConfigured)).toBeTruthy();
  expect(research().getByText("Tavily research is not configured: TAVILY_API_KEY is empty")).toBeTruthy();
  expect(research().queryByRole("button", { name: MESSAGES.tryAgain })).toBeNull();
  expect(research().queryByRole("button", { name: MESSAGES.run })).toBeNull();
  expect(screen.getAllByText(MESSAGES.notConfigured)).toHaveLength(2);
  expect(runs(sent)).toHaveLength(1);
});

it("offers to load the research again, not to re-run it, when it couldn't load", async () => {
  let fails = true;
  const sent = serve({
    ...companyDetailRoutes(ACME),
    [`GET /companies/${ID}/research`]: () => (fails ? { status: 500, data: { detail: "Failed to load research" } } : { status: 200, data: FULL }),
  });
  await renderCompanyDetail(ID);

  expect(await research().findByText(MESSAGES.couldntLoad)).toBeTruthy();
  fails = false;
  await fireEvent.press(research().getByRole("button", { name: MESSAGES.tryAgain }));
  expect(await research().findByText("Positive")).toBeTruthy();
  await waitFor(() => expect(runs(sent)).toEqual([]));
});
