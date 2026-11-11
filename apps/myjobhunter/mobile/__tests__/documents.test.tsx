import "@platform/mobile/test-support/reactNativeFormData";
import { DOCUMENT_KIND_FILTER_OPTIONS } from "@myjobhunter/api-client/constants/documentKindFilterOptions";
import { DOCUMENTS_PAGE_SIZE } from "@myjobhunter/api-client/constants/documentsPaging";
import { DOCUMENT_TITLE_MAX_LENGTH } from "@myjobhunter/api-client/constants/documentFieldLimits";
import type { Document } from "@myjobhunter/api-client/types/document/document";
import { formatShortDate } from "@myjobhunter/api-client/utils/formatShortDate";
import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE, ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { screen } from "expo-router/testing-library";
import { Alert, Linking } from "react-native";
import { Provider } from "react-redux";
import { DOCUMENT_MESSAGES as DOCUMENTS } from "../src/constants/documents";
import { DOCUMENTS_SCREEN_MESSAGES as MESSAGES } from "../src/constants/documentsScreen";
import DocumentsScreen from "../src/features/documents/DocumentsScreen";
import { store } from "../src/lib/store";
import { alertButton } from "../test-support/alertButton";
import { applicationDetailRecord } from "../test-support/applicationDetailRecord";
import { applicationDetailRoutes } from "../test-support/applicationDetailRoutes";
import { documentRecord } from "../test-support/documentRecord";
import { serve } from "../test-support/fakeServer";
import { storedItems } from "../test-support/memorySecureStore";
import { renderApp } from "../test-support/renderApp";
import { storeSession, tokens } from "../test-support/storedSession";
import type { FakeReply } from "../test-support/types/FakeReply";
import type { FakeRoute } from "../test-support/types/FakeRoute";
import type { SentRequest } from "../test-support/types/SentRequest";

jest.mock("expo-secure-store", () => jest.requireActual("../test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("../test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

const APP_ID = "app-stripe";
const PDF = "application/pdf";
// The server's order: newest change first.
const RESUME = documentRecord({
  id: "d-resume",
  application_id: APP_ID,
  title: "Stripe resume",
  kind: "tailored_resume",
  body: null,
  filename: "resume.pdf",
  content_type: PDF,
  size_bytes: 20480,
  has_file: true,
  updated_at: "2026-10-22T00:00:00Z",
});
const LETTER = documentRecord({ id: "d-letter", title: "General cover letter", updated_at: "2026-10-21T00:00:00Z" });
const POSTING = documentRecord({ id: "d-posting", application_id: APP_ID, title: "Stripe posting", kind: "job_description", updated_at: "2026-10-20T00:00:00Z" });
const ALL = [RESUME, LETTER, POSTING] as const;

const listOf = (...items: readonly Document[]): FakeReply => ({ status: 200, data: { items, total: items.length } });
const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

/** The documents held in memory, filtered by `kind` as the server does, plus any overrides. */
function serveDocuments(initial: readonly Document[], overrides: Record<string, FakeRoute> = {}): SentRequest[] {
  return serve({
    "GET /documents": (_body, params) => listOf(...initial.filter((doc) => !params.kind || doc.kind === params.kind)),
    ...overrides,
  });
}

const listRequests = (sent: SentRequest[]) => sent.filter(({ route }) => route === "GET /documents");

async function showScreen(): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <DocumentsScreen />
      </ToastProvider>
    </Provider>,
  );
}

function titles(): string[] {
  return screen.queryAllByTestId("document-title").map((title) => String(title.props.children));
}

function kindButton(label: string) {
  return screen.getByRole("button", { name: `${MESSAGES.kindFilter}: ${label}` });
}

async function chooseKind(current: string, next: string): Promise<void> {
  await fireEvent.press(kindButton(current));
  await fireEvent.press(await screen.findByRole("radio", { name: next }));
}

async function pullToRefresh(): Promise<void> {
  await act(async () => {
    await screen.getByTestId("documents-list").props.refreshControl.props.onRefresh();
  });
}

function pick(asset: Partial<DocumentPicker.DocumentPickerAsset> & Pick<DocumentPicker.DocumentPickerAsset, "name">): void {
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: `file:///cache/${asset.name}`, lastModified: 0, ...asset }],
  });
}

beforeEach(() => {
  storedItems.clear();
  storeSession();
  jest.clearAllMocks();
  store.dispatch(baseApi.util.resetApiState());
});

describe("the Documents list", () => {
  it("opens from More on the phone, not the website", async () => {
    serve({
      "POST /auth/mobile/refresh": () => ({ status: 200, data: tokens(1) }),
      "GET /auth/mobile/sessions": () => ({ status: 200, data: [] }),
      "GET /documents": () => listOf(),
    });
    await renderApp("/more");

    await fireEvent.press(await screen.findByRole("button", { name: "Documents" }));

    expect(screen).toHavePathname("/documents");
    expect(await screen.findByRole("header", { name: MESSAGES.noneHeading })).toBeTruthy();
    expect(openURL).not.toHaveBeenCalled();
  });

  it("opens on a skeleton of the header and cards, then shows each document with what the website shows", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    const sent = serve({
      "POST /auth/mobile/refresh": () => ({ status: 200, data: tokens(1) }),
      "GET /documents": () => new Promise<FakeReply>((resolve) => (answer = resolve)),
    });
    await renderApp("/documents");

    expect(await screen.findByLabelText(MESSAGES.loadingList)).toBeTruthy();
    expect(screen.getByTestId("documents-header-skeleton")).toBeTruthy();
    expect(screen.getAllByTestId("document-skeleton-card").length).toBeGreaterThan(0);
    // The cards' application links have stand-ins too, so the cards don't grow when they arrive.
    expect(screen.getAllByTestId("document-skeleton-link")).toHaveLength(screen.getAllByTestId("document-skeleton-card").length);

    await act(async () => answer(listOf(...ALL)));

    const resume = await screen.findByTestId("document-d-resume");
    expect(screen.getByText(MESSAGES.subtitle)).toBeTruthy();
    expect(screen.queryByLabelText(MESSAGES.loadingList)).toBeNull();
    expect(within(resume).getByText("Tailored Resume")).toBeTruthy();
    expect(within(resume).getByText(DOCUMENTS.file)).toBeTruthy();
    expect(within(resume).getByText(`${formatShortDate(RESUME.updated_at)} · 20.0 KB`)).toBeTruthy();
    expect(within(resume).getByRole("link", { name: DOCUMENTS.openApplicationFor("Stripe resume") }).props.accessibilityHint).toBe(DOCUMENTS.opensApplication);
    expect(within(resume).getByRole("button", { name: `${DOCUMENTS.open} Stripe resume` })).toBeTruthy();

    // A text document has nothing to open, and one not for an application has no link.
    const letter = screen.getByTestId("document-d-letter");
    expect(within(letter).getByText("Cover Letter")).toBeTruthy();
    expect(within(letter).queryByText(DOCUMENTS.file)).toBeNull();
    expect(within(letter).getByText(formatShortDate(LETTER.updated_at))).toBeTruthy();
    expect(within(letter).queryByRole("link")).toBeNull();
    expect(within(letter).queryByRole("button", { name: `${DOCUMENTS.open} General cover letter` })).toBeNull();
    expect(within(letter).getByRole("button", { name: `${DOCUMENTS.edit} General cover letter` })).toBeTruthy();
    expect(within(letter).getByRole("button", { name: `${DOCUMENTS.delete} General cover letter` })).toBeTruthy();

    // In the server's order, newest change first, of every type.
    expect(titles()).toEqual(["Stripe resume", "General cover letter", "Stripe posting"]);
    expect(kindButton("All types")).toBeTruthy();
    expect(listRequests(sent).map(({ params }) => params)).toEqual([{ limit: DOCUMENTS_PAGE_SIZE, offset: 0 }]);
  });

  it("opens the application a document is for, and comes back to the list", async () => {
    serve({
      "POST /auth/mobile/refresh": () => ({ status: 200, data: tokens(1) }),
      ...applicationDetailRoutes(applicationDetailRecord({ id: APP_ID, role_title: "Staff Engineer" }), { documents: ALL }),
    });
    await renderApp("/documents");

    await fireEvent.press(await screen.findByRole("link", { name: DOCUMENTS.openApplicationFor("Stripe posting") }));

    expect(screen).toHavePathname(`/applications/${APP_ID}`);
    expect(await screen.findByRole("header", { name: "Staff Engineer" })).toBeTruthy();
    await act(async () => router.back());
    expect(screen).toHavePathname("/documents");
  });

  it("filters by each type on the server, keeping the header while the type loads", async () => {
    let answer: (reply: FakeReply) => void = () => undefined;
    let isHeld = false;
    const sent = serveDocuments(ALL, {
      "GET /documents": (_body, params) => {
        const reply = listOf(...ALL.filter((doc) => !params.kind || doc.kind === params.kind));
        return isHeld ? new Promise<FakeReply>((resolve) => (answer = () => resolve(reply))) : reply;
      },
    });
    await showScreen();
    await screen.findByTestId("document-d-resume");

    isHeld = true;
    await chooseKind("All types", "Job Description");
    // The cards wait on the new type; the buttons above them stay put.
    expect(await screen.findByLabelText(MESSAGES.loadingList)).toBeTruthy();
    expect(screen.queryByTestId("documents-header-skeleton")).toBeNull();
    expect(kindButton("Job Description")).toBeTruthy();
    await act(async () => answer({ status: 200 }));
    isHeld = false;

    expect(await screen.findByTestId("document-d-posting")).toBeTruthy();
    expect(titles()).toEqual(["Stripe posting"]);

    let current = "Job Description";
    for (const option of DOCUMENT_KIND_FILTER_OPTIONS.filter(({ value }) => value !== "job_description")) {
      await chooseKind(current, option.label);
      current = option.label;
      await waitFor(() => expect(kindButton(current)).toBeTruthy());
      const expected = ALL.filter((doc) => option.value === "all" || doc.kind === option.value).map((doc) => doc.title);
      if (expected.length > 0) await waitFor(() => expect(titles()).toEqual(expected));
      else expect(await screen.findByRole("header", { name: MESSAGES.noneOfKindHeading(option.label) })).toBeTruthy();
    }
    // One request per type, in the order picked; going back to every type reuses what loaded first.
    expect(listRequests(sent).map(({ params }) => params.kind)).toEqual([
      undefined,
      "job_description",
      ...DOCUMENT_KIND_FILTER_OPTIONS.slice(1).flatMap(({ value }) => (value === "job_description" ? [] : [value])),
    ]);
  });

  it("says when there are none of a type, and shows every type again on request", async () => {
    serveDocuments([LETTER]);
    await showScreen();
    await screen.findByTestId("document-d-letter");

    await chooseKind("All types", "Portfolio");

    expect(await screen.findByRole("header", { name: MESSAGES.noneOfKindHeading("Portfolio") })).toBeTruthy();
    expect(screen.getByText(MESSAGES.noneOfKindBody)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.showAllTypes }));

    expect(await screen.findByTestId("document-d-letter")).toBeTruthy();
    expect(kindButton("All types")).toBeTruthy();
  });

  it("says when there are no documents yet, still offering upload, write and the type filter", async () => {
    serveDocuments([]);
    await showScreen();

    expect(await screen.findByRole("header", { name: MESSAGES.noneHeading })).toBeTruthy();
    expect(screen.getByText(MESSAGES.noneBody)).toBeTruthy();
    expect(screen.getByRole("button", { name: DOCUMENTS.upload })).toBeTruthy();
    expect(screen.getByRole("button", { name: DOCUMENTS.add })).toBeTruthy();
    expect(kindButton("All types")).toBeTruthy();
  });

  it("says when the list couldn't load, and loads it on Try again", async () => {
    let reply: FakeReply = { status: 500, data: { detail: "boom" } };
    serve({ "GET /documents": () => reply });
    await showScreen();

    expect(await screen.findByRole("header", { name: MESSAGES.couldntLoadList })).toBeTruthy();
    expect(screen.getByText(MESSAGES.tryAgainOffer)).toBeTruthy();
    expect(screen.queryByRole("button", { name: DOCUMENTS.upload })).toBeNull();

    reply = listOf(LETTER);
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));

    expect(await screen.findByTestId("document-d-letter")).toBeTruthy();
    expect(screen.queryByRole("header", { name: MESSAGES.couldntLoadList })).toBeNull();
  });

  it("says when a type couldn't load, keeping the filter so another can be picked", async () => {
    let fails = false;
    serveDocuments(ALL, {
      "GET /documents": (_body, params) => (fails ? { status: 503 } : listOf(...ALL.filter((doc) => !params.kind || doc.kind === params.kind))),
    });
    await showScreen();
    await screen.findByTestId("document-d-resume");

    fails = true;
    await chooseKind("All types", "Cover Letter");
    expect(await screen.findByRole("header", { name: MESSAGES.couldntLoadList })).toBeTruthy();
    expect(kindButton("Cover Letter")).toBeTruthy();

    fails = false;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByTestId("document-d-letter")).toBeTruthy();
    expect(titles()).toEqual(["General cover letter"]);
  });

  it("refreshes on pull, and keeps what it last loaded when the refresh fails", async () => {
    let reply = listOf(LETTER);
    serve({ "GET /documents": () => reply });
    await showScreen();
    await screen.findByTestId("document-d-letter");

    reply = listOf(RESUME, LETTER);
    await pullToRefresh();
    expect(await screen.findByTestId("document-d-resume")).toBeTruthy();

    reply = { status: 503, data: { detail: "down" } };
    await pullToRefresh();
    await waitFor(() => expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy());
    expect(titles()).toEqual(["Stripe resume", "General cover letter"]);
  });
});

describe("a document's actions", () => {
  it("opens a file through a fresh download link, showing it's opening from the press", async () => {
    let answer: () => void = () => undefined;
    const sent = serveDocuments([RESUME], {
      "GET /documents/d-resume/download": () => new Promise<FakeReply>((resolve) => (answer = () => resolve({ status: 200, data: { url: "https://files.example.com/resume.pdf" } }))),
    });
    await showScreen();
    await fireEvent.press(await screen.findByRole("button", { name: `${DOCUMENTS.open} Stripe resume` }));

    expect(await screen.findByText(DOCUMENTS.opening)).toBeTruthy();
    await act(async () => answer());
    await waitFor(() => expect(openURL).toHaveBeenLastCalledWith("https://files.example.com/resume.pdf"));

    await fireEvent.press(screen.getByRole("button", { name: `${DOCUMENTS.open} Stripe resume` }));
    await act(async () => answer());
    // Never reused: the link expires.
    expect(sent.filter(({ route }) => route === "GET /documents/d-resume/download")).toHaveLength(2);
  });

  it("says so when the file won't open, and never opens a link that isn't a web address", async () => {
    let reply: FakeReply = { status: 500 };
    serveDocuments([RESUME], { "GET /documents/d-resume/download": () => reply });
    await showScreen();
    const open = await screen.findByRole("button", { name: `${DOCUMENTS.open} Stripe resume` });

    await fireEvent.press(open);
    expect(await screen.findByText(DOCUMENTS.couldntOpen)).toBeTruthy();

    reply = { status: 200, data: { url: "javascript:alert(1)" } };
    await fireEvent.press(screen.getByRole("button", { name: `${DOCUMENTS.open} Stripe resume` }));
    expect(await screen.findByText(DOCUMENTS.unsafeLink)).toBeTruthy();
    expect(openURL).not.toHaveBeenCalled();
  });

  it("uploads a picked file with its title and type, for no application, then shows it in the list", async () => {
    let documents: Document[] = [LETTER];
    let answer: () => void = () => undefined;
    const sent = serve({
      "GET /documents": () => listOf(...documents),
      "POST /documents/upload": () =>
        new Promise<FakeReply>(
          (resolve) =>
            (answer = () => {
              documents = [{ ...RESUME, application_id: null, title: "My resume" }, LETTER];
              resolve({ status: 201, data: documents[0] });
            }),
        ),
    });
    await showScreen();
    await fireEvent.press(await screen.findByRole("button", { name: DOCUMENTS.upload }));
    expect(await screen.findByRole("header", { name: DOCUMENTS.uploadTitle })).toBeTruthy();

    pick({ name: "resume.pdf", mimeType: PDF, size: 20480 });
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.chooseFile }));
    expect(await screen.findByText("resume.pdf (20.0 KB)")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(`${DOCUMENTS.titleLabel}, required`), "My resume");
    await fireEvent.press(screen.getByRole("radio", { name: "Tailored Resume" }));
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.uploadSubmit }));

    expect(await screen.findByRole("button", { name: DOCUMENTS.uploading })).toBeDisabled();
    await act(async () => answer());

    expect(await screen.findByText(DOCUMENTS.uploaded)).toBeTruthy();
    const form = sent.filter(({ route }) => route === "POST /documents/upload")[0].data as FormData;
    expect(["title", "kind", "application_id"].map((name) => form.getAll(name))).toEqual([["My resume"], ["tailored_resume"], []]);
    expect(form.getAll("file")).toEqual([{ uri: "file:///cache/resume.pdf", name: "resume.pdf", type: PDF }]);
    await waitFor(() => expect(titles()).toEqual(["My resume", "General cover letter"]));
  });

  it("keeps the upload sheet and the chosen file when the upload fails", async () => {
    serveDocuments([], { "POST /documents/upload": () => ({ status: 500 }) });
    await showScreen();
    await fireEvent.press(await screen.findByRole("button", { name: DOCUMENTS.upload }));
    pick({ name: "resume.pdf", mimeType: PDF, size: 2048 });
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.chooseFile }));
    await fireEvent.changeText(await screen.findByLabelText(`${DOCUMENTS.titleLabel}, required`), "Resume");
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.uploadSubmit }));

    expect(await screen.findByText(DOCUMENTS.couldntUpload)).toBeTruthy();
    expect(screen.getByText("resume.pdf (2.0 KB)")).toBeTruthy();
    expect(screen.getByRole("button", { name: DOCUMENTS.uploadSubmit })).toBeEnabled();
  });

  it("writes a text document for no application, after asking for a title and content", async () => {
    const sent = serveDocuments([], { "POST /documents": () => ({ status: 201, data: LETTER }) });
    await showScreen();
    await fireEvent.press(await screen.findByRole("button", { name: DOCUMENTS.add }));
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.create }));

    expect(await screen.findByText(DOCUMENTS.titleRequired)).toBeTruthy();
    expect(screen.getByText(DOCUMENTS.contentRequired)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(`${DOCUMENTS.titleLabel}, required`), "General cover letter");
    await fireEvent.changeText(screen.getByLabelText(`${DOCUMENTS.contentLabel}, required`), "Dear hiring team");
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.create }));

    expect(await screen.findByText(DOCUMENTS.created)).toBeTruthy();
    expect(sent.filter(({ route }) => route === "POST /documents").map(({ body }) => body)).toEqual([
      { title: "General cover letter", kind: "cover_letter", application_id: null, body: "Dear hiring team" },
    ]);
  });

  it("says when a title is too long, keeping all of it, and won't save until it's short enough", async () => {
    const sent = serveDocuments([], { "POST /documents": () => ({ status: 201, data: LETTER }) });
    await showScreen();
    await fireEvent.press(await screen.findByRole("button", { name: DOCUMENTS.add }));

    const tooLong = "t".repeat(DOCUMENT_TITLE_MAX_LENGTH + 1);
    await fireEvent.changeText(screen.getByLabelText(`${DOCUMENTS.titleLabel}, required`), tooLong);
    await fireEvent.changeText(screen.getByLabelText(`${DOCUMENTS.contentLabel}, required`), "Body");
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.create }));

    expect(screen.getByLabelText(`${DOCUMENTS.titleLabel}, required`).props.value).toBe(tooLong);
    expect(screen.getByLabelText(`${DOCUMENTS.titleLabel}, required`).props.maxLength).toBeUndefined();
    expect(sent.filter(({ route }) => route === "POST /documents")).toEqual([]);
  });

  it("edits a text document's title, type and content, sending only what changed", async () => {
    const sent = serveDocuments([LETTER], { "PATCH /documents/d-letter": () => ({ status: 200, data: LETTER }) });
    await showScreen();
    await fireEvent.press(await screen.findByRole("button", { name: `${DOCUMENTS.edit} General cover letter` }));

    expect(await screen.findByRole("header", { name: DOCUMENTS.editTitle })).toBeTruthy();
    expect(screen.getByLabelText(DOCUMENTS.contentLabel).props.value).toBe("Dear hiring team");
    await fireEvent.changeText(screen.getByLabelText(DOCUMENTS.contentLabel), "Dear Stripe");
    await fireEvent.press(screen.getByRole("radio", { name: "Other" }));
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.saveChanges }));

    expect(await screen.findByText(DOCUMENTS.updated)).toBeTruthy();
    expect(sent.filter(({ route }) => route === "PATCH /documents/d-letter").map(({ body }) => body)).toEqual([{ kind: "other", body: "Dear Stripe" }]);
  });

  it("keeps the edit sheet and says so when saving fails", async () => {
    serveDocuments([RESUME], { "PATCH /documents/d-resume": () => ({ status: 500 }) });
    await showScreen();
    await fireEvent.press(await screen.findByRole("button", { name: `${DOCUMENTS.edit} Stripe resume` }));

    expect(screen.getByText(`resume.pdf — ${DOCUMENTS.fileContent}`)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(`${DOCUMENTS.titleLabel}, required`), "Resume v2");
    await fireEvent.press(screen.getByRole("button", { name: DOCUMENTS.saveChanges }));

    expect(await screen.findByText(DOCUMENTS.couldntUpdate)).toBeTruthy();
    expect(screen.getByRole("header", { name: DOCUMENTS.editTitle })).toBeTruthy();
    expect(screen.getByLabelText(`${DOCUMENTS.titleLabel}, required`).props.value).toBe("Resume v2");
  });

  it("deletes a document after asking, showing it's deleting from the press, and drops it from the list", async () => {
    let documents: Document[] = [RESUME, LETTER];
    let answer: () => void = () => undefined;
    const sent = serve({
      "GET /documents": () => listOf(...documents),
      "DELETE /documents/d-letter": () =>
        new Promise<FakeReply>(
          (resolve) =>
            (answer = () => {
              documents = [RESUME];
              resolve({ status: 204 });
            }),
        ),
    });
    await showScreen();

    await fireEvent.press(await screen.findByRole("button", { name: `${DOCUMENTS.delete} General cover letter` }));
    expect(alert).toHaveBeenLastCalledWith(DOCUMENTS.deleteTitle, `"General cover letter" — ${DOCUMENTS.deleteBody}`, expect.any(Array));
    // Keep leaves it alone.
    expect(alertButton(DOCUMENTS.keep).style).toBe("cancel");
    expect(sent.filter(({ route }) => route.startsWith("DELETE"))).toEqual([]);

    await act(async () => alertButton(DOCUMENTS.delete).onPress?.());
    expect(await screen.findByText(DOCUMENTS.deleting)).toBeTruthy();
    await act(async () => answer());

    expect(await screen.findByText(DOCUMENTS.deleted)).toBeTruthy();
    await waitFor(() => expect(titles()).toEqual(["Stripe resume"]));
  });

  it("drops a deleted document from the list even when the reload after it fails", async () => {
    let reloadFails = false;
    serve({
      "GET /documents": () => (reloadFails ? { status: 503, data: { detail: "down" } } : listOf(RESUME, LETTER)),
      "DELETE /documents/d-letter": () => {
        reloadFails = true;
        return { status: 204 };
      },
    });
    await showScreen();

    await fireEvent.press(await screen.findByRole("button", { name: `${DOCUMENTS.delete} General cover letter` }));
    await act(async () => alertButton(DOCUMENTS.delete).onPress?.());

    expect(await screen.findByText(DOCUMENTS.deleted)).toBeTruthy();
    await waitFor(() => expect(titles()).toEqual(["Stripe resume"]));
    expect(screen.queryByText(DOCUMENTS.deleting)).toBeNull();
    await waitFor(() => expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy());
  });

  it("says so and keeps the document when deleting fails", async () => {
    serveDocuments([LETTER], { "DELETE /documents/d-letter": () => ({ status: 500 }) });
    await showScreen();

    await fireEvent.press(await screen.findByRole("button", { name: `${DOCUMENTS.delete} General cover letter` }));
    await act(async () => alertButton(DOCUMENTS.delete).onPress?.());

    expect(await screen.findByText(DOCUMENTS.couldntDelete)).toBeTruthy();
    expect(screen.getByRole("button", { name: `${DOCUMENTS.delete} General cover letter` })).toBeEnabled();
    expect(titles()).toEqual(["General cover letter"]);
  });
});
