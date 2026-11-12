import {
  ADD_APPLICATION_FORM_PROBLEMS,
  COMPANY_NAME_MAX_LENGTH,
  JD_READ_LONG_RUNNING_MS,
  JD_TEXT_MAX_LENGTH,
  JOB_URL_MAX_LENGTH,
  LOCATION_MAX_LENGTH,
  ROLE_TITLE_MAX_LENGTH,
} from "@myjobhunter/api-client/constants/addApplicationForm";
import { RATE_LIMITED_MESSAGES } from "@myjobhunter/api-client/constants/rateLimitedMessages";
import { COMPANY_FORM_PROBLEMS } from "@myjobhunter/api-client/constants/companyFormProblems";
import { APPLICATION_NOTES_MAX_LENGTH } from "@myjobhunter/api-client/constants/textFieldLimits";
import type { JdParseResponse } from "@myjobhunter/api-client/types/application/jd-parse-response";
import type { JdUrlExtractResponse } from "@myjobhunter/api-client/types/application/jd-url-extract-response";
import type { Company } from "@myjobhunter/api-client/types/company";
import { baseApi } from "@platform/core/store/baseApi";
import { DISCARD_MESSAGES } from "@platform/mobile";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { Alert } from "react-native";
import { ADD_APPLICATION_MESSAGES as MESSAGES } from "../src/constants/addApplication";
import { APPLICATION_MESSAGES } from "../src/constants/applications";
import { store } from "../src/lib/store";
import { alertButton } from "@platform/mobile/test-support/alertButton";
import { applicationRecord } from "../test-support/applicationRecord";
import { companyRecord } from "../test-support/companyRecord";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { renderApp } from "../test-support/renderApp";
import { storeSession, tokens } from "@platform/mobile/test-support/storedSession";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { FakeRoute } from "@platform/mobile/test-support/types/FakeRoute";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("expo-clipboard", () => ({ getStringAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
const clipboard = jest.mocked(Clipboard.getStringAsync);

const STRIPE = companyRecord({ id: "co-stripe", name: "Stripe", primary_domain: "stripe.com" });
const AIRBNB = companyRecord({ id: "co-airbnb", name: "Airbnb", primary_domain: "airbnb.com" });
const LINK = "https://jobs.example.com/posting/123";
// Role title is required, and says so to a screen reader.
const ROLE_FIELD = `${MESSAGES.roleLabel}, required`;

function extracted(overrides: Partial<JdUrlExtractResponse> = {}): JdUrlExtractResponse {
  return {
    title: "Staff Engineer",
    company: "Stripe",
    company_website: null,
    company_logo_url: null,
    location: "Seattle, WA",
    description_html: "<p>Build <strong>payments</strong>&nbsp;infra.</p><script>track()</script>",
    requirements_text: "Must have:\n- Go",
    summary: "Payments platform role.",
    source_url: LINK,
    ...overrides,
  };
}

function parsed(overrides: Partial<JdParseResponse> = {}): JdParseResponse {
  return {
    title: "Senior Engineer",
    company: "Airbnb",
    location: "Remote-US",
    remote_type: "remote",
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    seniority: null,
    must_have_requirements: [],
    nice_to_have_requirements: [],
    responsibilities: [],
    summary: "Host tools.",
    ...overrides,
  };
}

const ok = (data: unknown) => (): FakeReply => ({ status: 200, data });
const fail = (status: number, detail: unknown = "boom") => (): FakeReply => ({ status, data: { detail } });

/** The list, the companies, and a POST /applications that echoes what it's sent. Overrides win. */
function serveAdd(routes: Record<string, FakeRoute> = {}, companies: Company[] = [STRIPE, AIRBNB]) {
  return serve({
    "POST /auth/mobile/refresh": ok(tokens(1)),
    "GET /applications": ok({ items: [], total: 0 }),
    "GET /companies": ok({ items: companies, total: companies.length }),
    "POST /applications": (body) => ({ status: 201, data: applicationRecord({ id: "app-new", role_title: String(body.role_title) }) }),
    "POST /companies/co-new/research": ok({}),
    ...routes,
  });
}

/**
 * Opens the add screen. `fromList` opens it over the list, as pressing Add does, so there's a list
 * to go back to; otherwise it opens as a link would, and leaving replaces it with the list.
 */
async function openAddScreen({ fromList = false } = {}): Promise<void> {
  await renderApp(fromList ? "/applications" : "/applications/new");
  if (fromList) {
    await screen.findByText(APPLICATION_MESSAGES.noneHeading);
    await act(async () => router.push("/applications/new"));
  }
  await screen.findByTestId("add-application");
}

async function chooseSource(label: string): Promise<void> {
  await fireEvent.press(screen.getByRole("tab", { name: label }));
}

async function readLink(link = LINK): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText(MESSAGES.linkLabel), link);
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.autoFill }));
}

function field(label: string) {
  return screen.getByLabelText(label);
}

function requestsTo(sent: ReturnType<typeof serve>, route: string) {
  return sent.filter((request) => request.route === route);
}

beforeEach(() => {
  storedItems.clear();
  storeSession();
  alert.mockClear();
  warn.mockClear();
  clipboard.mockReset();
  store.dispatch(baseApi.util.resetApiState());
});

describe("from a link", () => {
  it("reads the posting, matches a company already tracked, and saves exactly what the website sends", async () => {
    const sent = serveAdd({ "POST /applications/extract-from-url": ok(extracted()) });
    await openAddScreen({ fromList: true });
    await readLink();

    expect(await screen.findByText(MESSAGES.reviewHeading)).toBeTruthy();
    expect(screen.getByText("Payments platform role.")).toBeTruthy();
    expect(screen.getByText(`${MESSAGES.fromLink} ${LINK}`)).toBeTruthy();
    expect(screen.getByRole("button", { name: `${MESSAGES.companyLabel}, Stripe` })).toBeTruthy();
    expect(screen.getByText(MESSAGES.companyTracked)).toBeTruthy();
    expect(field(ROLE_FIELD).props.value).toBe("Staff Engineer");
    expect(field(MESSAGES.locationLabel).props.value).toBe("Seattle, WA");
    // Summary, the description as plain text (no script), then the requirements, as on the website.
    expect(field(MESSAGES.notesLabel).props.value).toBe("Payments platform role.\n\nBuild payments infra.\n\nMust have:\n- Go");
    expect(requestsTo(sent, "POST /applications/extract-from-url").map(({ body }) => body)).toEqual([{ url: LINK }]);
    expect(requestsTo(sent, "POST /companies")).toHaveLength(0);

    const listLoads = requestsTo(sent, "GET /applications").length;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));

    expect(await screen.findByText(MESSAGES.added)).toBeTruthy();
    expect(requestsTo(sent, "POST /applications").map(({ body }) => body)).toEqual([
      {
        company_id: "co-stripe",
        role_title: "Staff Engineer",
        url: LINK,
        location: "Seattle, WA",
        remote_type: "unknown",
        notes: "Payments platform role.\n\nBuild payments infra.\n\nMust have:\n- Go",
        jd_text: null,
      },
    ]);
    // Back on the list, which reloads to show the new application.
    await waitFor(() => expect(screen).toHavePathname("/applications"));
    await waitFor(() => expect(requestsTo(sent, "GET /applications").length).toBeGreaterThan(listLoads));
    expect(alert).not.toHaveBeenCalled();
  });

  it("adds a company the posting names that isn't tracked yet, with its website and logo, and starts its research", async () => {
    const sent = serveAdd({
      "POST /applications/extract-from-url": ok(
        extracted({ company: "Linear", company_website: "https://www.linear.app/about", company_logo_url: "https://cdn.linear.app/logo.png" }),
      ),
      "POST /companies": ok(companyRecord({ id: "co-new", name: "Linear" })),
    });
    await openAddScreen();
    await readLink();

    expect(await screen.findByText(MESSAGES.companyAdded)).toBeTruthy();
    expect(screen.getByRole("button", { name: `${MESSAGES.companyLabel}, Linear` })).toBeTruthy();
    expect(requestsTo(sent, "POST /companies").map(({ body }) => body)).toEqual([
      { name: "Linear", primary_domain: "linear.app", logo_url: "https://cdn.linear.app/logo.png" },
    ]);
    await waitFor(() => expect(requestsTo(sent, "POST /companies/co-new/research")).toHaveLength(1));

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));
    await screen.findByText(MESSAGES.added);
    expect(requestsTo(sent, "POST /applications")[0]?.body).toMatchObject({ company_id: "co-new" });
  });

  it("pastes a link from the clipboard and reads it straight away, as pasting does on the website", async () => {
    clipboard.mockResolvedValue(`  ${LINK}  `);
    const sent = serveAdd({ "POST /applications/extract-from-url": ok(extracted()) });
    await openAddScreen();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.pasteLink }));

    expect(await screen.findByText(MESSAGES.reviewHeading)).toBeTruthy();
    expect(requestsTo(sent, "POST /applications/extract-from-url").map(({ body }) => body)).toEqual([{ url: LINK }]);
  });

  it("says when there's nothing on the clipboard, or it isn't a link, without asking the server", async () => {
    const sent = serveAdd();
    await openAddScreen();

    clipboard.mockResolvedValue("");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.pasteLink }));
    expect(await screen.findByText(MESSAGES.noLinkOnClipboard)).toBeTruthy();

    clipboard.mockResolvedValue("not a link");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.pasteLink }));
    expect(await screen.findByText(MESSAGES.notALink)).toBeTruthy();
    expect(requestsTo(sent, "POST /applications/extract-from-url")).toHaveLength(0);
  });

  it("keeps the typed link when what's pasted isn't one that can be read", async () => {
    const sent = serveAdd();
    await openAddScreen();
    await fireEvent.changeText(field(MESSAGES.linkLabel), LINK);

    clipboard.mockResolvedValue("not a link");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.pasteLink }));
    expect(await screen.findByText(MESSAGES.notALink)).toBeTruthy();
    expect(field(MESSAGES.linkLabel).props.value).toBe(LINK);

    clipboard.mockResolvedValue(`https://jobs.example.com/${"a".repeat(JOB_URL_MAX_LENGTH)}`);
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.pasteLink }));
    expect(await screen.findByText(ADD_APPLICATION_FORM_PROBLEMS.jobUrlTooLong)).toBeTruthy();
    expect(field(MESSAGES.linkLabel).props.value).toBe(LINK);
    expect(requestsTo(sent, "POST /applications/extract-from-url")).toHaveLength(0);
  });

  it("says when the clipboard can't be read", async () => {
    serveAdd();
    await openAddScreen();
    clipboard.mockRejectedValue(new Error("denied"));
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.pasteLink }));

    expect(await screen.findByText(MESSAGES.couldntReadClipboard)).toBeTruthy();
  });

  it("matches a tracked company even when the companies are still loading as the posting is read", async () => {
    let answerCompanies: (reply: FakeReply) => void = () => undefined;
    const sent = serveAdd({
      "POST /applications/extract-from-url": ok(extracted()),
      "GET /companies": () => new Promise<FakeReply>((resolve) => (answerCompanies = resolve)),
    });
    await openAddScreen();
    await readLink();
    await waitFor(() => expect(requestsTo(sent, "POST /applications/extract-from-url")).toHaveLength(1));
    expect(screen.queryByText(MESSAGES.reviewHeading)).toBeNull();

    await act(async () => answerCompanies(ok({ items: [STRIPE, AIRBNB], total: 2 })()));
    expect(await screen.findByText(MESSAGES.companyTracked)).toBeTruthy();
    expect(requestsTo(sent, "POST /companies")).toHaveLength(0);
  });

  it("shows it's reading on the button, says when it's slow, and won't read twice", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    const sent = serveAdd({
      "POST /applications/extract-from-url": () => new Promise<FakeReply>((resolve) => (answer = resolve)),
    });
    await openAddScreen();
    // renderApp runs on Jest's fake clock, so the slow-read hint can be reached without waiting.
    await readLink();
    expect(await screen.findByRole("button", { name: MESSAGES.readingLink })).toBeTruthy();
    expect(screen.queryByText(MESSAGES.longRunning)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.readingLink }));
    expect(requestsTo(sent, "POST /applications/extract-from-url")).toHaveLength(1);

    await act(async () => {
      jest.advanceTimersByTime(JD_READ_LONG_RUNNING_MS);
    });
    expect(screen.getByText(MESSAGES.longRunning)).toBeTruthy();
    await act(async () => answer(ok(extracted())()));
    expect(await screen.findByText(MESSAGES.reviewHeading)).toBeTruthy();
  });

  it("moves to pasting the text when the link needs a sign-in, saying why", async () => {
    serveAdd({ "POST /applications/extract-from-url": fail(422, "auth_required") });
    await openAddScreen();
    await readLink();

    expect(await screen.findByText(MESSAGES.linkBlocked)).toBeTruthy();
    expect(field(MESSAGES.textLabel)).toBeTruthy();
    expect(screen.queryByLabelText(MESSAGES.linkLabel)).toBeNull();

    // The notice belongs to the text tab.
    await chooseSource("Link");
    expect(screen.queryByText(MESSAGES.linkBlocked)).toBeNull();
  });

  it("says what went wrong reading a link for any other reason, and stays on the link", async () => {
    serveAdd({ "POST /applications/extract-from-url": fail(504) });
    await openAddScreen();
    await readLink();

    expect(
      await screen.findByText(`${MESSAGES.couldntAutoFill} The page took too long to load. Try again or paste the description text.`),
    ).toBeTruthy();
    expect(field(MESSAGES.linkLabel).props.value).toBe(LINK);
    expect(screen.queryByText(MESSAGES.reviewHeading)).toBeNull();
  });

  it("adds the company when saving if adding it after the read failed", async () => {
    let failAdd = true;
    const sent = serveAdd({
      "POST /applications/extract-from-url": ok(extracted({ company: "Linear" })),
      "POST /companies": () => (failAdd ? fail(500)() : ok(companyRecord({ id: "co-linear", name: "Linear" }))()),
      "POST /companies/co-linear/research": ok({}),
    });
    await openAddScreen();
    await readLink();

    expect(await screen.findByText(MESSAGES.companyAddFailed)).toBeTruthy();
    expect(screen.getByText(MESSAGES.couldntAddCompany)).toBeTruthy();

    failAdd = false;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));
    await screen.findByText(MESSAGES.added);
    expect(requestsTo(sent, "POST /companies").map(({ body }) => body)).toEqual([{ name: "Linear" }, { name: "Linear" }]);
    expect(requestsTo(sent, "POST /applications")[0]?.body).toMatchObject({ company_id: "co-linear" });
    // Added at save time, it's researched as one added by the read would be.
    await waitFor(() => expect(requestsTo(sent, "POST /companies/co-linear/research")).toHaveLength(1));
  });

  it("says the companies didn't load, not that adding one failed, when GET /companies fails during the read", async () => {
    const sent = serveAdd({
      "POST /applications/extract-from-url": ok(extracted({ company: "Linear" })),
      "GET /companies": fail(500),
    });
    await openAddScreen();
    await readLink();

    expect(await screen.findByText(MESSAGES.companyAddFailed)).toBeTruthy();
    expect(screen.getByText(MESSAGES.couldntLoadCompanies)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.couldntAddCompany)).toBeNull();
    expect(requestsTo(sent, "POST /companies")).toHaveLength(0);
  });

  it("asks for a company when the posting didn't name one", async () => {
    const sent = serveAdd({ "POST /applications/extract-from-url": ok(extracted({ company: null })) });
    await openAddScreen();
    await readLink();

    expect(await screen.findByText(MESSAGES.companyNotFound)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));
    expect(await screen.findByText(MESSAGES.companyRequired)).toBeTruthy();
    expect(requestsTo(sent, "POST /applications")).toHaveLength(0);
  });
});

describe("from pasted text", () => {
  it("reads the description and saves it as the job description, with the remote type it found", async () => {
    const sent = serveAdd({ "POST /applications/parse-jd": ok(parsed()) });
    await openAddScreen();
    await chooseSource("Paste text");
    await fireEvent.changeText(field(MESSAGES.textLabel), "  We're hiring a Senior Engineer at Airbnb.  ");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.autoFillFromText }));

    expect(await screen.findByText(MESSAGES.companyTracked)).toBeTruthy();
    expect(screen.getByRole("button", { name: `${MESSAGES.remoteLabel}, Remote` })).toBeTruthy();
    expect(requestsTo(sent, "POST /applications/parse-jd").map(({ body }) => body)).toEqual([
      { jd_text: "We're hiring a Senior Engineer at Airbnb." },
    ]);

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));
    await screen.findByText(MESSAGES.added);
    expect(requestsTo(sent, "POST /applications").map(({ body }) => body)).toEqual([
      {
        company_id: "co-airbnb",
        role_title: "Senior Engineer",
        url: null,
        location: "Remote-US",
        remote_type: "remote",
        notes: null,
        jd_text: "We're hiring a Senior Engineer at Airbnb.",
      },
    ]);
  });

  it("says when the description couldn't be read, keeping what was pasted", async () => {
    serveAdd({ "POST /applications/parse-jd": fail(502) });
    await openAddScreen();
    await chooseSource("Paste text");
    await fireEvent.changeText(field(MESSAGES.textLabel), "Some JD");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.autoFillFromText }));

    expect(await screen.findByText(MESSAGES.couldntReadText)).toBeTruthy();
    expect(field(MESSAGES.textLabel).props.value).toBe("Some JD");
  });

  it("says plainly that the limit was hit when the description is read too often, keeping what was pasted", async () => {
    serveAdd({ "POST /applications/parse-jd": fail(429) });
    await openAddScreen();
    await chooseSource("Paste text");
    await fireEvent.changeText(field(MESSAGES.textLabel), "Some JD");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.autoFillFromText }));

    expect(await screen.findByText(RATE_LIMITED_MESSAGES.jobPosting)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.couldntReadText)).toBeNull();
    expect(field(MESSAGES.textLabel).props.value).toBe("Some JD");
  });

  it("says when the description is too long to read, keeping all of it, and won't send it", async () => {
    const sent = serveAdd({ "POST /applications/parse-jd": ok(parsed()) });
    await openAddScreen();
    await chooseSource("Paste text");
    const tooLong = "a".repeat(JD_TEXT_MAX_LENGTH + 1);
    await fireEvent.changeText(field(MESSAGES.textLabel), tooLong);

    expect(screen.getByText(ADD_APPLICATION_FORM_PROBLEMS.jdTextTooLong)).toBeTruthy();
    expect(field(MESSAGES.textLabel).props.value).toBe(tooLong);
    expect(field(MESSAGES.textLabel).props.maxLength).toBeUndefined();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.autoFillFromText }));
    expect(requestsTo(sent, "POST /applications/parse-jd")).toHaveLength(0);

    await fireEvent.changeText(field(MESSAGES.textLabel), "a".repeat(JD_TEXT_MAX_LENGTH));
    expect(screen.queryByText(ADD_APPLICATION_FORM_PROBLEMS.jdTextTooLong)).toBeNull();
  });
});

describe("typed in", () => {
  it("picks a tracked company, searching by name or website, then saves the rest as typed", async () => {
    const sent = serveAdd();
    await openAddScreen();
    await chooseSource("Type it in");
    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.companyLabel}, ${MESSAGES.chooseCompany}` }));

    await fireEvent.changeText(await screen.findByLabelText(MESSAGES.searchLabel), "airbnb.com");
    expect(screen.queryByRole("button", { name: "Stripe, stripe.com" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Airbnb, airbnb.com" }));

    expect(await screen.findByText(MESSAGES.companyChosen)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.reviewHeading)).toBeNull();
    await fireEvent.changeText(field(ROLE_FIELD), "  Data Engineer ");
    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.remoteLabel}, Unknown` }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Hybrid" }));
    await fireEvent.changeText(field(MESSAGES.notesLabel), "Referred by Sam");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));

    await screen.findByText(MESSAGES.added);
    expect(requestsTo(sent, "POST /companies")).toHaveLength(0);
    expect(requestsTo(sent, "POST /applications").map(({ body }) => body)).toEqual([
      { company_id: "co-airbnb", role_title: "Data Engineer", url: null, location: null, remote_type: "hybrid", notes: "Referred by Sam", jd_text: null },
    ]);
  });

  it("adds a new company typed into the picker, but not one already tracked", async () => {
    const sent = serveAdd({ "POST /companies": ok(companyRecord({ id: "co-new", name: "Linear" })) });
    await openAddScreen();
    await chooseSource("Type it in");
    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.companyLabel}, ${MESSAGES.chooseCompany}` }));

    const search = await screen.findByLabelText(MESSAGES.searchLabel);
    await fireEvent.changeText(search, "stripe");
    expect(screen.queryByRole("button", { name: `${MESSAGES.addCompany} “stripe”` })).toBeNull();

    await fireEvent.changeText(search, "Linear ");
    expect(screen.getByText(MESSAGES.noMatches)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.addCompany} “Linear”` }));

    expect(await screen.findByText(MESSAGES.companyAdded)).toBeTruthy();
    expect(screen.queryByTestId("company-picker")).toBeNull();
    expect(requestsTo(sent, "POST /companies").map(({ body }) => body)).toEqual([{ name: "Linear" }]);
  });

  it("says in the picker when adding a company failed, and stays open to try again", async () => {
    let failAdd = true;
    serveAdd({
      "POST /companies": () => (failAdd ? fail(500)() : ok(companyRecord({ id: "co-new", name: "Linear" }))()),
    });
    await openAddScreen();
    await chooseSource("Type it in");
    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.companyLabel}, ${MESSAGES.chooseCompany}` }));
    await fireEvent.changeText(await screen.findByLabelText(MESSAGES.searchLabel), "Linear");
    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.addCompany} “Linear”` }));

    expect(await screen.findByText(MESSAGES.couldntAddCompany)).toBeTruthy();
    expect(screen.getByTestId("company-picker")).toBeTruthy();

    failAdd = false;
    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.addCompany} “Linear”` }));
    expect(await screen.findByText(MESSAGES.companyAdded)).toBeTruthy();
  });

  it("changes the company a posting matched, starting the search on its name, and keeps it on Close", async () => {
    const sent = serveAdd({
      "POST /applications/extract-from-url": ok(extracted()),
      "POST /companies": fail(500),
    });
    await openAddScreen();
    await readLink();
    await fireEvent.press(await screen.findByRole("button", { name: `${MESSAGES.companyLabel}, Stripe` }));

    const search = await screen.findByLabelText(MESSAGES.searchLabel);
    expect(search.props.value).toBe("Stripe");
    await fireEvent.changeText(search, "Linear");
    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.addCompany} “Linear”` }));
    expect(await screen.findByText(MESSAGES.couldntAddCompany)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.close }));
    expect(screen.getByRole("button", { name: `${MESSAGES.companyLabel}, Stripe` })).toBeTruthy();

    // Opening it again starts afresh.
    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.companyLabel}, Stripe` }));
    expect((await screen.findByLabelText(MESSAGES.searchLabel)).props.value).toBe("Stripe");
    expect(screen.queryByText(MESSAGES.couldntAddCompany)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Clear search" }));
    await fireEvent.press(screen.getByRole("button", { name: "Airbnb, airbnb.com" }));

    expect(await screen.findByText(MESSAGES.companyTracked)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));
    await screen.findByText(MESSAGES.added);
    expect(requestsTo(sent, "POST /applications")[0]?.body).toMatchObject({ company_id: "co-airbnb", url: LINK });
  });

  it("keeps a posting's long company name in the search, says it's too long, and offers no add", async () => {
    const longName = `Acme ${"x".repeat(COMPANY_NAME_MAX_LENGTH)}`;
    serveAdd({
      "POST /applications/extract-from-url": ok(extracted({ company: longName })),
      "POST /companies": fail(422),
    });
    await openAddScreen();
    await readLink();
    await fireEvent.press(await screen.findByRole("button", { name: `${MESSAGES.companyLabel}, ${longName}` }));
    const picker = within(await screen.findByTestId("company-picker"));

    expect((await screen.findByLabelText(MESSAGES.searchLabel)).props.value).toBe(longName);
    expect(picker.getByText(COMPANY_FORM_PROBLEMS.nameTooLong)).toBeTruthy();
    expect(picker.queryByRole("button", { name: new RegExp(`^${MESSAGES.addCompany} “`) })).toBeNull();

    await fireEvent.changeText(screen.getByLabelText(MESSAGES.searchLabel), "😀".repeat(COMPANY_NAME_MAX_LENGTH));
    expect(picker.queryByText(COMPANY_FORM_PROBLEMS.nameTooLong)).toBeNull();
    expect(await picker.findByRole("button", { name: new RegExp(`^${MESSAGES.addCompany} “`) })).toBeTruthy();
  });

  it("doesn't try to add a read company name that is too long: it says so in the banner and again on Save", async () => {
    const longName = `Acme ${"x".repeat(COMPANY_NAME_MAX_LENGTH)}`;
    const sent = serveAdd({ "POST /applications/extract-from-url": ok(extracted({ company: longName })) });
    await openAddScreen();
    await readLink();

    expect(await screen.findAllByText(COMPANY_FORM_PROBLEMS.nameTooLong)).not.toHaveLength(0);
    expect(requestsTo(sent, "POST /companies")).toHaveLength(0);
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));

    expect((await screen.findAllByText(COMPANY_FORM_PROBLEMS.nameTooLong)).length).toBeGreaterThan(1);
    expect(requestsTo(sent, "POST /companies")).toHaveLength(0);
    expect(requestsTo(sent, "POST /applications")).toHaveLength(0);
  });

  it("shows a skeleton of the companies while they load, and a way to try again when they don't", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    const sent = serveAdd({ "GET /companies": () => new Promise<FakeReply>((resolve) => (answer = resolve)) });
    await openAddScreen();
    await chooseSource("Type it in");
    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.companyLabel}, ${MESSAGES.chooseCompany}` }));

    expect(await screen.findByLabelText(MESSAGES.loadingCompanies)).toBeTruthy();
    expect(screen.getAllByTestId("company-picker-skeleton-row").length).toBeGreaterThan(0);

    await waitFor(() => expect(requestsTo(sent, "GET /companies")).toHaveLength(1));
    serveAdd({ "GET /companies": ok({ items: [STRIPE], total: 1 }) });
    await act(async () => answer(fail(500)()));
    expect(await screen.findByText(MESSAGES.couldntLoadCompanies)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByRole("button", { name: "Stripe, stripe.com" })).toBeTruthy();
  });
});

describe("checking and saving", () => {
  it("won't save without a role title, saying so under the field", async () => {
    const sent = serveAdd({ "POST /applications/extract-from-url": ok(extracted({ title: null })) });
    await openAddScreen();
    await readLink();
    await screen.findByText(MESSAGES.reviewHeading);

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));
    expect(await screen.findByText(ADD_APPLICATION_FORM_PROBLEMS.roleTitleRequired)).toBeTruthy();
    expect(requestsTo(sent, "POST /applications")).toHaveLength(0);

    await fireEvent.changeText(field(ROLE_FIELD), "Engineer");
    expect(screen.queryByText(ADD_APPLICATION_FORM_PROBLEMS.roleTitleRequired)).toBeNull();
  });

  it("doesn't cut pasted text short: it says what is too long and won't save it", async () => {
    const sent = serveAdd({ "POST /applications/extract-from-url": ok(extracted()) });
    await openAddScreen();
    expect(field(MESSAGES.linkLabel).props.maxLength).toBeUndefined();
    await readLink();
    await screen.findByText(MESSAGES.reviewHeading);
    expect(field(ROLE_FIELD).props.maxLength).toBeUndefined();
    expect(field(MESSAGES.locationLabel).props.maxLength).toBeUndefined();
    expect(field(MESSAGES.notesLabel).props.maxLength).toBeUndefined();

    // An emoji is one character to the backend: 200 of them fit, one more is too long.
    const tooLongRole = "😀".repeat(ROLE_TITLE_MAX_LENGTH + 1);
    await fireEvent.changeText(field(ROLE_FIELD), tooLongRole);
    await fireEvent.changeText(field(MESSAGES.locationLabel), "a".repeat(LOCATION_MAX_LENGTH + 1));
    await fireEvent.changeText(field(MESSAGES.notesLabel), "a".repeat(APPLICATION_NOTES_MAX_LENGTH + 1));
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));

    expect(await screen.findByText(ADD_APPLICATION_FORM_PROBLEMS.roleTitleTooLong)).toBeTruthy();
    expect(screen.getByText(ADD_APPLICATION_FORM_PROBLEMS.locationTooLong)).toBeTruthy();
    expect(screen.getByText(ADD_APPLICATION_FORM_PROBLEMS.notesTooLong)).toBeTruthy();
    expect(field(ROLE_FIELD).props.value).toBe(tooLongRole);
    expect(requestsTo(sent, "POST /applications")).toHaveLength(0);

    await fireEvent.changeText(field(ROLE_FIELD), "😀".repeat(ROLE_TITLE_MAX_LENGTH));
    expect(screen.queryByText(ADD_APPLICATION_FORM_PROBLEMS.roleTitleTooLong)).toBeNull();
  });

  it("says when saving failed, keeping everything typed, and saves on a second try", async () => {
    let failSave = true;
    const sent = serveAdd({
      "POST /applications/extract-from-url": ok(extracted()),
      "POST /applications": (body) =>
        failSave ? fail(500)() : { status: 201, data: applicationRecord({ id: "app-new", role_title: String(body.role_title) }) },
    });
    await openAddScreen();
    await readLink();
    await screen.findByText(MESSAGES.reviewHeading);
    await fireEvent.changeText(field(ROLE_FIELD), "Principal Engineer");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));

    // Toasted, as on the website, rather than in the banner at the top of the form.
    expect(await screen.findByText(MESSAGES.couldntSave)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss notification" })).toBeTruthy();
    expect(screen).toHavePathname("/applications/new");
    expect(field(ROLE_FIELD).props.value).toBe("Principal Engineer");

    failSave = false;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));
    await screen.findByText(MESSAGES.added);
    expect(requestsTo(sent, "POST /applications")).toHaveLength(2);
  });

  it("shows it's saving on the button the moment it's pressed, and won't save twice", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    const sent = serveAdd({
      "POST /applications/extract-from-url": ok(extracted()),
      "POST /applications": () => new Promise<FakeReply>((resolve) => (answer = resolve)),
    });
    await openAddScreen();
    await readLink();
    await screen.findByText(MESSAGES.reviewHeading);
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));

    const saving = await screen.findByRole("button", { name: MESSAGES.saving });
    await fireEvent.press(saving);
    expect(requestsTo(sent, "POST /applications")).toHaveLength(1);
    await act(async () => answer({ status: 201, data: applicationRecord({ id: "app-new" }) }));
    await screen.findByText(MESSAGES.added);
  });
});

describe("leaving", () => {
  it("goes straight back when nothing has been entered", async () => {
    serveAdd();
    await openAddScreen({ fromList: true });
    await act(async () => router.back());

    expect(screen).toHavePathname("/applications");
    expect(alert).not.toHaveBeenCalled();
  });

  it("asks before throwing away a typed link, keeping it on Keep editing and leaving on Discard", async () => {
    serveAdd();
    await openAddScreen({ fromList: true });
    await fireEvent.changeText(field(MESSAGES.linkLabel), LINK);

    await act(async () => router.back());
    expect(alert).toHaveBeenLastCalledWith(DISCARD_MESSAGES.discardTitle, DISCARD_MESSAGES.discardBody, expect.any(Array));
    await act(async () => alertButton(DISCARD_MESSAGES.keepEditing).onPress?.());
    expect(screen).toHavePathname("/applications/new");
    expect(field(MESSAGES.linkLabel).props.value).toBe(LINK);

    await act(async () => router.back());
    await act(async () => alertButton(DISCARD_MESSAGES.discard).onPress?.());
    await waitFor(() => expect(screen).toHavePathname("/applications"));
  });

  it("stops reading when left mid-read, adding no company for the posting", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    const sent = serveAdd({
      "POST /applications/extract-from-url": () => new Promise<FakeReply>((resolve) => (answer = resolve)),
      "POST /companies": ok(companyRecord({ id: "co-linear", name: "Linear" })),
    });
    await openAddScreen({ fromList: true });
    await readLink();
    await screen.findByRole("button", { name: MESSAGES.readingLink });

    await act(async () => router.back());
    await act(async () => alertButton(DISCARD_MESSAGES.discard).onPress?.());
    await waitFor(() => expect(screen).toHavePathname("/applications"));
    await act(async () => answer(ok(extracted({ company: "Linear" }))()));

    expect(requestsTo(sent, "POST /companies")).toHaveLength(0);
  });

  it("asks before throwing away a read posting", async () => {
    serveAdd({ "POST /applications/extract-from-url": ok(extracted()) });
    await openAddScreen({ fromList: true });
    await readLink();
    await screen.findByText(MESSAGES.reviewHeading);
    await fireEvent.changeText(field(ROLE_FIELD), "Changed");

    await act(async () => router.back());
    expect(alert).toHaveBeenCalledTimes(1);
    expect(screen).toHavePathname("/applications/new");
  });
});
