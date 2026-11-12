import { DOCUMENTS_PAGE_SIZE } from "@myjobhunter/api-client/constants/documentsPaging";
import type { Document } from "@myjobhunter/api-client/types/document/document";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { DOCUMENT_MESSAGES as DOCUMENTS } from "../src/constants/documents";
import { PAGED_LIST_MESSAGES as PAGED } from "../src/constants/pagedListMessages";
import { DOCUMENTS_SCREEN_MESSAGES as MESSAGES } from "../src/constants/documentsScreen";
import ApplicationDetailScreen from "../src/features/applicationDetail/ApplicationDetailScreen";
import DocumentsScreen from "../src/features/documents/DocumentsScreen";
import { store } from "../src/lib/store";
import { alertButton } from "@platform/mobile/test-support/alertButton";
import { applicationDetailRecord } from "../test-support/applicationDetailRecord";
import { applicationDetailRoutes } from "../test-support/applicationDetailRoutes";
import { documentRecord } from "../test-support/documentRecord";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { renderApplicationDetail } from "../test-support/renderApplicationDetail";
import { storeSession } from "@platform/mobile/test-support/storedSession";
import type { FakeParams } from "@platform/mobile/test-support/types/FakeParams";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { SentRequest } from "@platform/mobile/test-support/types/SentRequest";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
// A short page keeps every row inside the list's first render window, which only draws about ten.
jest.mock("@myjobhunter/api-client/constants/documentsPaging", () => ({ DOCUMENTS_PAGE_SIZE: 4, FIRST_DOCUMENTS_OFFSET: 0 }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  usePreventRemove: jest.fn(),
}));

jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

const EXTRA = 3;
const COUNT = DOCUMENTS_PAGE_SIZE + EXTRA;
// Newest first, as the server returns them; every third one is a resume.
const MANY: readonly Document[] = Array.from({ length: COUNT }, (_, index) =>
  documentRecord({
    id: `d${index}`,
    title: `Doc ${index}`,
    kind: index % 3 === 0 ? "tailored_resume" : "cover_letter",
    updated_at: new Date(Date.UTC(2026, 9, 1) - index * 60_000).toISOString(),
  }),
);

/** The server's page: the rows matching `kind` and `application_id`, then this offset and limit, with the full count. */
function pageOf(all: readonly Document[], params: FakeParams): FakeReply {
  const matching = all.filter((doc) => (!params.kind || doc.kind === params.kind) && (!params.application_id || doc.application_id === params.application_id));
  const offset = Number(params.offset ?? 0);
  const limit = Number(params.limit ?? DOCUMENTS_PAGE_SIZE);
  return { status: 200, data: { items: matching.slice(offset, offset + limit), total: matching.length } };
}

const listRequests = (sent: SentRequest[]) => sent.filter(({ route }) => route === "GET /documents");
const titles = (): string[] => screen.queryAllByTestId("document-title").map((title) => String(title.props.children));
const showMore = () => screen.getByRole("button", { name: PAGED.loadMore });

async function showScreen(): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <DocumentsScreen />
      </ToastProvider>
    </Provider>,
  );
}

beforeEach(() => {
  storedItems.clear();
  storeSession();
  jest.clearAllMocks();
  store.dispatch(baseApi.util.resetApiState());
});

describe("the Documents list, past the first page", () => {
  it("shows the first page and how many there are in all, then the rest on Show more", async () => {
    const sent = serve({ "GET /documents": (_body, params) => pageOf(MANY, params) });
    await showScreen();

    expect(await screen.findByText(PAGED.showingCount(DOCUMENTS_PAGE_SIZE, COUNT))).toBeTruthy();
    expect(titles()).toHaveLength(DOCUMENTS_PAGE_SIZE);
    expect(titles()[0]).toBe("Doc 0");

    await fireEvent.press(showMore());

    expect(await screen.findByText("Doc " + (COUNT - 1))).toBeTruthy();
    expect(titles()).toEqual(MANY.map((doc) => doc.title));
    // Everything is loaded: no count line, no button.
    expect(screen.queryByRole("button", { name: PAGED.loadMore })).toBeNull();
    expect(screen.queryByText(/^Showing /)).toBeNull();
    expect(listRequests(sent).map(({ params }) => [params.offset, params.limit])).toEqual([
      [0, DOCUMENTS_PAGE_SIZE],
      [DOCUMENTS_PAGE_SIZE, DOCUMENTS_PAGE_SIZE],
    ]);
  });

  it("has no Show more when everything fits on one page", async () => {
    serve({ "GET /documents": (_body, params) => pageOf(MANY.slice(0, 3), params) });
    await showScreen();

    expect(await screen.findByText("Doc 2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: PAGED.loadMore })).toBeNull();
  });

  it("keeps the type filter while paging, with the count of that type", async () => {
    const resumes = MANY.filter((doc) => doc.kind === "tailored_resume");
    const sent = serve({ "GET /documents": (_body, params) => pageOf(MANY, params) });
    await showScreen();
    await screen.findByText(PAGED.showingCount(DOCUMENTS_PAGE_SIZE, COUNT));

    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.kindFilter}: All types` }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Tailored Resume" }));

    await waitFor(() => expect(titles()).toEqual(resumes.map((doc) => doc.title)));
    // All of them fit on one page, so there is nothing more to ask for.
    expect(screen.queryByRole("button", { name: PAGED.loadMore })).toBeNull();
    expect(listRequests(sent).at(-1)?.params).toEqual(expect.objectContaining({ kind: "tailored_resume", offset: 0 }));
  });

  it("keeps the type filter on the next page", async () => {
    const manyResumes = Array.from({ length: COUNT }, (_, index) => documentRecord({ id: `r${index}`, title: `Resume ${index}`, kind: "tailored_resume" }));
    const sent = serve({ "GET /documents": (_body, params) => pageOf([...manyResumes, ...MANY], params) });
    await showScreen();
    await screen.findByText(PAGED.showingCount(DOCUMENTS_PAGE_SIZE, COUNT + MANY.length));

    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.kindFilter}: All types` }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Tailored Resume" }));
    await screen.findByText(PAGED.showingCount(DOCUMENTS_PAGE_SIZE, COUNT + MANY.filter((doc) => doc.kind === "tailored_resume").length));
    await fireEvent.press(showMore());

    await waitFor(() => expect(listRequests(sent).at(-1)?.params).toEqual(expect.objectContaining({ kind: "tailored_resume", offset: DOCUMENTS_PAGE_SIZE })));
  });

  it("shows the next page loading, and offers Try again keeping the rows when it fails", async () => {
    let failNextPage = true;
    serve({ "GET /documents": (_body, params) => (Number(params.offset) > 0 && failNextPage ? { status: 503 } : pageOf(MANY, params)) });
    await showScreen();
    await screen.findByText(PAGED.showingCount(DOCUMENTS_PAGE_SIZE, COUNT));

    await fireEvent.press(showMore());
    expect(await screen.findByText(PAGED.couldntLoadMore)).toBeTruthy();
    expect(titles()).toHaveLength(DOCUMENTS_PAGE_SIZE);

    failNextPage = false;
    await fireEvent.press(screen.getByRole("button", { name: PAGED.tryAgain }));
    expect(await screen.findByText(`Doc ${COUNT - 1}`)).toBeTruthy();
    expect(titles()).toHaveLength(COUNT);
  });

  it("takes a document deleted from a later page out and lowers the count", async () => {
    const rows = [...MANY];
    const sent = serve({
      "GET /documents": (_body, params) => pageOf(rows, params),
      [`DELETE /documents/d${COUNT - 1}`]: () => {
        rows.pop();
        return { status: 204 };
      },
    });
    await showScreen();
    await screen.findByText(PAGED.showingCount(DOCUMENTS_PAGE_SIZE, COUNT));
    await fireEvent.press(showMore());
    await screen.findByText(`Doc ${COUNT - 1}`);

    await fireEvent.press(screen.getByRole("button", { name: `${DOCUMENTS.delete} Doc ${COUNT - 1}` }));
    await act(async () => alertButton(DOCUMENTS.delete).onPress?.());

    expect(await screen.findByText(DOCUMENTS.deleted)).toBeTruthy();
    await waitFor(() => expect(titles()).toEqual(MANY.slice(0, COUNT - 1).map((doc) => doc.title)));
    expect(screen.queryByText(`Doc ${COUNT - 1}`)).toBeNull();
    // Both loaded pages were reloaded, and the list is still whole and counted right.
    await waitFor(() => expect(listRequests(sent).length).toBeGreaterThanOrEqual(4));
    expect(titles()).toHaveLength(COUNT - 1);
    expect(screen.queryByRole("button", { name: PAGED.loadMore })).toBeNull();
  });

  it("counts down on the first page's Showing line after a delete", async () => {
    const rows = [...MANY];
    serve({
      "GET /documents": (_body, params) => pageOf(rows, params),
      "DELETE /documents/d0": () => {
        rows.shift();
        return { status: 204 };
      },
    });
    await showScreen();
    await screen.findByText(PAGED.showingCount(DOCUMENTS_PAGE_SIZE, COUNT));

    await fireEvent.press(screen.getByRole("button", { name: `${DOCUMENTS.delete} Doc 0` }));
    await act(async () => alertButton(DOCUMENTS.delete).onPress?.());

    expect(await screen.findByText(PAGED.showingCount(DOCUMENTS_PAGE_SIZE, COUNT - 1))).toBeTruthy();
    expect(screen.queryByText("Doc 0")).toBeNull();
  });
});

describe("an application's documents, past the first page", () => {
  const ID = "app-stripe";
  const STRIPE = applicationDetailRecord({ id: ID, company_id: "c-stripe", role_title: "Staff Engineer" });
  const LINKED = MANY.map((doc) => ({ ...doc, application_id: ID }));

  it("shows the first page and loads the rest on Show more", async () => {
    const sent = serve({ ...applicationDetailRoutes(STRIPE), "GET /documents": (_body, params) => pageOf(LINKED, params) });
    await renderApplicationDetail(ID);

    expect(await screen.findByText(PAGED.showingCount(DOCUMENTS_PAGE_SIZE, COUNT))).toBeTruthy();
    expect(screen.getAllByTestId("document-title")).toHaveLength(DOCUMENTS_PAGE_SIZE);

    await fireEvent.press(showMore());

    expect(await screen.findByText(`Doc ${COUNT - 1}`)).toBeTruthy();
    expect(screen.getAllByTestId("document-title")).toHaveLength(COUNT);
    expect(screen.queryByRole("button", { name: PAGED.loadMore })).toBeNull();
    expect(listRequests(sent).map(({ params }) => params)).toEqual([
      { application_id: ID, limit: DOCUMENTS_PAGE_SIZE, offset: 0 },
      { application_id: ID, limit: DOCUMENTS_PAGE_SIZE, offset: DOCUMENTS_PAGE_SIZE },
    ]);
  });

  it("doesn't show the previous application's documents while a new id's load", async () => {
    const OTHER_ID = "app-acme";
    const OTHER = applicationDetailRecord({ id: OTHER_ID, company_id: "c-acme", role_title: "Designer" });
    const stripeDoc = documentRecord({ id: "d-stripe", application_id: ID, title: "Stripe letter" });
    const acmeDoc = documentRecord({ id: "d-acme", application_id: OTHER_ID, title: "Acme letter" });
    let answerAcme: () => void = () => undefined;
    serve({
      ...applicationDetailRoutes(STRIPE),
      ...applicationDetailRoutes(OTHER),
      "GET /documents": (_body, params) =>
        params.application_id === OTHER_ID
          ? new Promise<FakeReply>((resolve) => (answerAcme = () => resolve({ status: 200, data: { items: [acmeDoc], total: 1, has_more: false } })))
          : { status: 200, data: { items: [stripeDoc], total: 1, has_more: false } },
    });
    const screenFor = (id: string) => (
      <Provider store={store}>
        <ToastProvider bottomOffset={0}>
          <ApplicationDetailScreen id={id} />
        </ToastProvider>
      </Provider>
    );
    const { rerender } = await render(screenFor(ID));
    expect(await screen.findByText("Stripe letter")).toBeTruthy();

    await rerender(screenFor(OTHER_ID));
    await screen.findByText("Designer");

    // The other application's documents are still loading: a skeleton, never the Stripe ones.
    expect(await screen.findByTestId("documents-skeleton")).toBeTruthy();
    expect(screen.queryByText("Stripe letter")).toBeNull();

    await act(async () => answerAcme());
    expect(await screen.findByText("Acme letter")).toBeTruthy();
    expect(screen.queryByText("Stripe letter")).toBeNull();
  });
});
