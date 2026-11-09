import type { ChecklistItem } from "@mybookkeeper/api-client/types/tax/ChecklistItem";
import type { SourceDocumentsResponse } from "@mybookkeeper/api-client/types/tax/SourceDocumentsResponse";
import type { TaxSourceDocument } from "@mybookkeeper/api-client/types/tax/TaxSourceDocument";
import { documentsApi } from "@mybookkeeper/api-client/store/documentsApi";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { Provider } from "react-redux";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { TAX_DOCUMENTS_MESSAGES as MESSAGES } from "../src/constants/taxDocuments";
import { TAX_REPORT_MESSAGES } from "../src/constants/taxReport";
import { taxDocumentName, taxDocumentSections } from "../src/features/tax/taxDocumentsDisplay";
import TaxDocumentsScreen from "../src/features/tax/TaxDocumentsScreen";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { store } from "../src/lib/store";
import { useToday } from "../src/lib/useToday";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path) },
}));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: jest.fn() }));
jest.mock("../src/lib/useToday", () => ({ useToday: jest.fn() }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;

function aDocument(overrides: Partial<TaxSourceDocument> = {}): TaxSourceDocument {
  return {
    document_id: "d1",
    file_name: "scan.pdf",
    document_type: "1099_k",
    issuer_name: "Airbnb",
    issuer_ein: null,
    tax_year: 2025,
    key_amount: 1200,
    source: "upload",
    uploaded_at: "2026-02-01T00:00:00Z",
    form_instance_id: "i1",
    ...overrides,
  };
}

function anItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    expected_type: "1099_k",
    expected_from: "Vrbo",
    reason: "Reservations found on Vrbo platform",
    status: "missing",
    document_id: null,
    ...overrides,
  };
}

interface Server {
  response: SourceDocumentsResponse;
  reads: unknown[];
  dead: boolean;
  never: boolean;
  status?: number;
}

function serve(response: SourceDocumentsResponse = { documents: [aDocument()], checklist: [anItem()] }): Server {
  const server: Server = { response, reads: [], dead: false, never: false };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    if (server.never) return new Promise(() => undefined);
    if (server.dead) throw Object.assign(new Error("Network Error"), { isAxiosError: true, config });
    server.reads.push((config.params as { tax_year: number } | undefined)?.tax_year ?? "all");
    const answer = { data: server.response, status: server.status ?? 200, statusText: "", headers: {}, config } as never;
    if (server.status) throw Object.assign(new Error("refused"), { isAxiosError: true, response: answer, config });
    return answer;
  };
  api.defaults.adapter = adapter;
  return server;
}

async function show(): Promise<void> {
  await render(
    <Provider store={store}>
      <TaxDocumentsScreen />
    </Provider>,
  );
}

async function chooseYear(year: string): Promise<void> {
  await fireEvent.press(screen.getByLabelText(new RegExp(`^${TAX_REPORT_MESSAGES.year}`)));
  await fireEvent.press(await screen.findByText(year));
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  mockPush.mockReset();
  jest.mocked(useCanWrite).mockReturnValue(true);
  jest.mocked(useToday).mockReturnValue(new Date(2026, 10, 5));
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

describe("taxDocumentSections", () => {
  it("puts what's missing first, then forms in tax order with unknown forms last", () => {
    const sections = taxDocumentSections({
      documents: [
        aDocument({ form_instance_id: "a", document_type: "new_form" }),
        aDocument({ form_instance_id: "b", document_type: "1099_k" }),
        aDocument({ form_instance_id: "c", document_type: "w2" }),
      ],
      checklist: [anItem({ expected_type: "1098", expected_from: null }), anItem()],
    });
    expect(sections.map((section) => section.title)).toEqual([MESSAGES.stillWaiting, "W-2", "1099-K", "New Form"]);
    expect(sections[0].data.map((item) => "expected_type" in item && item.expected_type)).toEqual(["1099_k", "1098"]);
  });

  it("has no waiting section when nothing is missing, and ignores received checklist rows", () => {
    const sections = taxDocumentSections({ documents: [aDocument()], checklist: [anItem({ status: "received", document_id: "d1" })] });
    expect(sections.map((section) => section.title)).toEqual(["1099-K"]);
  });

  it("names a document by its file when the issuer is unknown, and never leaves it blank", () => {
    expect(taxDocumentName(aDocument({ issuer_name: null }))).toBe("scan.pdf");
    expect(taxDocumentName(aDocument({ issuer_name: null, file_name: null }))).toBe(MESSAGES.unnamed);
  });
});

describe("TaxDocumentsScreen", () => {
  it("asks for last year first and shows what's missing and what I have", async () => {
    const server = serve();
    await show();
    expect(await screen.findByText("1099-K · Vrbo")).toBeTruthy();
    expect(screen.getByText("Reservations found on Vrbo platform")).toBeTruthy();
    expect(screen.getByText(MESSAGES.stillWaiting)).toBeTruthy();
    expect(screen.getByText("Airbnb")).toBeTruthy();
    expect(server.reads).toEqual([2025]);
  });

  it("says forms appear once they've been read, so a form still being read doesn't look lost", async () => {
    serve({ documents: [], checklist: [] });
    await show();
    await screen.findByText(MESSAGES.noneHeading(2025));
    expect(screen.getByText(MESSAGES.readNote)).toBeTruthy();
  });

  it("opens a document", async () => {
    serve();
    await show();
    await fireEvent.press(await screen.findByRole("button", { name: "1099-K, Airbnb" }));
    expect(mockPush).toHaveBeenCalledWith("/documents/d1");
  });

  it("lets a writer add a missing form", async () => {
    serve();
    await show();
    await fireEvent.press(await screen.findByRole("button", { name: `${MESSAGES.addIt}: 1099-K · Vrbo` }));
    expect(mockPush).toHaveBeenCalledWith("/camera");
  });

  it("shows a viewer what's missing with no way to add it", async () => {
    jest.mocked(useCanWrite).mockReturnValue(false);
    serve();
    await show();
    await screen.findByText("1099-K · Vrbo");
    expect(screen.queryByText(MESSAGES.addIt)).toBeNull();
  });

  it("offers a writer a way to add the first document", async () => {
    serve({ documents: [], checklist: [] });
    await show();
    expect(await screen.findByText(MESSAGES.noneHeading(2025))).toBeTruthy();
    await fireEvent.press(screen.getByText(MESSAGES.addDocument));
    expect(mockPush).toHaveBeenCalledWith("/camera");
  });

  it("gives a viewer the empty state with no action", async () => {
    jest.mocked(useCanWrite).mockReturnValue(false);
    serve({ documents: [], checklist: [] });
    await show();
    expect(await screen.findByText(MESSAGES.noneBodyViewer)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.addDocument)).toBeNull();
  });

  it("doesn't call a year empty when only missing forms exist", async () => {
    serve({ documents: [], checklist: [anItem()] });
    await show();
    await screen.findByText("1099-K · Vrbo");
    expect(screen.queryByText(MESSAGES.noneHeading(2025))).toBeNull();
  });

  it("shows a skeleton while loading, and never the empty state", async () => {
    const server = serve();
    server.never = true;
    await show();
    expect(await screen.findByTestId("tax-documents-skeleton")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading(2025))).toBeNull();
  });

  it("doesn't read a network failure as empty, and tries again", async () => {
    const server = serve();
    server.dead = true;
    await show();
    expect(await screen.findByText(MESSAGES.couldntLoad(2025))).toBeTruthy();
    expect(screen.getByText(MESSAGES.checkConnection)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading(2025))).toBeNull();
    server.dead = false;
    await fireEvent.press(screen.getByText(MESSAGES.tryAgain));
    expect(await screen.findByText("Airbnb")).toBeTruthy();
  });

  it("doesn't blame the connection when the server answered", async () => {
    const server = serve();
    server.status = 500;
    await show();
    expect(await screen.findByText(MESSAGES.tryAgainLater)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.checkConnection)).toBeNull();
  });

  it("clears the old year while the next one loads, then shows only that year", async () => {
    const server = serve();
    await show();
    await screen.findByText("Airbnb");
    server.never = true;
    await chooseYear("2024");
    expect(await screen.findByTestId("tax-documents-skeleton")).toBeTruthy();
    expect(screen.queryByText("Airbnb")).toBeNull();
  });

  it("asks for the year I choose", async () => {
    const server = serve();
    await show();
    await screen.findByText("Airbnb");
    await chooseYear("2024");
    await waitFor(() => expect(server.reads).toEqual([2025, 2024]));
  });

  it("shows every year when asked, with the years told apart and no year sent", async () => {
    const server = serve({
      documents: [aDocument(), aDocument({ document_id: "d2", form_instance_id: "i2", tax_year: 2024, issuer_name: "Acme", document_type: "w2" })],
      checklist: [],
    });
    await show();
    await screen.findByText("Airbnb");
    await chooseYear(MESSAGES.allYears);
    await waitFor(() => expect(server.reads).toEqual([2025, "all"]));
    expect(await screen.findByText(MESSAGES.yearForm(2025, "1099-K"))).toBeTruthy();
    expect(screen.getByText(MESSAGES.yearForm(2024, "W-2"))).toBeTruthy();
  });

  it("says how many forms I have and how many are still missing", async () => {
    serve({ documents: [aDocument()], checklist: [anItem(), anItem({ expected_from: "Stripe" }), anItem({ status: "received", document_id: "d1" })] });
    await show();
    expect(await screen.findByText(MESSAGES.checklistCount(1, 2))).toBeTruthy();
  });

  it("shows a form's EIN under its name", async () => {
    serve({ documents: [aDocument({ issuer_ein: "12-3456789" })], checklist: [] });
    await show();
    expect(await screen.findByText(MESSAGES.ein("12-3456789"))).toBeTruthy();
  });

  it("calls every-year empty by its own words, not a year's", async () => {
    serve({ documents: [], checklist: [] });
    await show();
    await screen.findByText(MESSAGES.noneHeading(2025));
    await chooseYear(MESSAGES.allYears);
    expect(await screen.findByText(MESSAGES.noneHeading(null))).toBeTruthy();
  });

  it("keeps what's on screen and says so when a refresh fails", async () => {
    const server = serve();
    await show();
    await screen.findByText("Airbnb");
    server.dead = true;
    await act(async () => {
      await screen.getByTestId("tax-documents-list").props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByText("Airbnb")).toBeTruthy();
  });

  it("reloads when documents change", async () => {
    const server = serve();
    await show();
    await screen.findByText("Airbnb");
    await act(async () => {
      store.dispatch(documentsApi.util.invalidateTags(["Document"]));
    });
    await waitFor(() => expect(server.reads).toHaveLength(2));
  });
});
