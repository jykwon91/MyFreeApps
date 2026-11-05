import { TAX_RETURN_STATUS_LABELS } from "@mybookkeeper/api-client/constants/taxReturnLabels";
import type { FormOverviewItem } from "@mybookkeeper/api-client/types/tax/FormOverviewItem";
import type { SourceDocumentsResponse } from "@mybookkeeper/api-client/types/tax/SourceDocumentsResponse";
import type { TaxReturn } from "@mybookkeeper/api-client/types/tax/TaxReturn";
import type { ValidationResult } from "@mybookkeeper/api-client/types/tax/ValidationResult";
import { formatLongDate } from "@mybookkeeper/api-client/utils/inquiryDateFormat";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { Alert, Linking } from "react-native";
import { Provider } from "react-redux";
import { WEB_BASE_URL } from "../src/constants/api";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { TAX_DOCUMENTS_MESSAGES } from "../src/constants/taxDocuments";
import { SEVERITY_LABELS, TAX_RETURNS_MESSAGES as MESSAGES } from "../src/constants/taxReturns";
import { bySeverity } from "../src/features/taxReturns/taxReturnDisplay";
import TaxReturnDetailScreen from "../src/features/taxReturns/TaxReturnDetailScreen";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { useIsAdmin } from "../src/features/workspace/useIsAdmin";
import { store } from "../src/lib/store";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path) },
}));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: jest.fn() }));
jest.mock("../src/features/workspace/useIsAdmin", () => ({ useIsAdmin: jest.fn() }));

const originalAdapter = api.defaults.adapter;

function aReturn(overrides: Partial<TaxReturn> = {}): TaxReturn {
  return {
    id: "r1",
    organization_id: "o1",
    tax_year: 2025,
    filing_status: "single",
    jurisdiction: "federal",
    status: "draft",
    needs_recompute: false,
    filed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

function aResult(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    severity: "warning",
    form_name: "schedule_e",
    field_id: null,
    message: "Rents look low",
    expected_value: null,
    actual_value: null,
    ...overrides,
  };
}

const DOCUMENTS: SourceDocumentsResponse = {
  documents: [
    {
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
    },
  ],
  checklist: [
    { expected_type: "1099_k", expected_from: "Vrbo", reason: "Reservations found on Vrbo", status: "missing", document_id: null },
  ],
};

const FORMS: FormOverviewItem[] = [{ form_name: "schedule_e", instance_count: 1, field_count: 12 }];

type Part = "return" | "validation" | "documents" | "forms" | "recompute";

interface Server {
  taxReturn: TaxReturn;
  validation: ValidationResult[];
  documents: SourceDocumentsResponse;
  forms: FormOverviewItem[];
  failing: Partial<Record<Part, number>>;
  recomputes: number;
  /** Holds the recalculation's answer until this settles. */
  recomputeGate?: Promise<void>;
  /** Never answers, so the screen stays loading. */
  hanging?: Part;
}

function partOf(url: string): Part {
  if (url.endsWith("/recompute")) return "recompute";
  if (url.endsWith("/validation")) return "validation";
  if (url.endsWith("/source-documents")) return "documents";
  if (url.endsWith("/forms-overview")) return "forms";
  return "return";
}

function serve(overrides: Partial<Server> = {}): Server {
  const server: Server = {
    taxReturn: aReturn(),
    validation: [aResult()],
    documents: DOCUMENTS,
    forms: FORMS,
    failing: {},
    recomputes: 0,
    ...overrides,
  };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    const part = partOf(config.url ?? "");
    if (part === server.hanging) return new Promise(() => undefined);
    const failure = server.failing[part];
    if (part === "recompute" && !failure) {
      server.recomputes += 1;
      await server.recomputeGate;
      server.taxReturn = { ...server.taxReturn, needs_recompute: false };
    }
    const bodies: Record<Part, unknown> = {
      return: server.taxReturn,
      validation: server.validation,
      documents: server.documents,
      forms: server.forms,
      recompute: { status: "ok", forms_updated: 1 },
    };
    const answer = { data: bodies[part], status: failure ?? 200, statusText: "", headers: {}, config } as never;
    if (failure) throw Object.assign(new Error("refused"), { isAxiosError: true, response: answer, config });
    return answer;
  };
  api.defaults.adapter = adapter;
  return server;
}

async function show(): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <TaxReturnDetailScreen id="r1" />
      </ToastProvider>
    </Provider>,
  );
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  jest.restoreAllMocks();
  mockPush.mockReset();
  jest.mocked(useCanWrite).mockReturnValue(true);
  jest.mocked(useIsAdmin).mockReturnValue(true);
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

describe("bySeverity", () => {
  it("puts errors first, then warnings, then notes", () => {
    const sorted = bySeverity([aResult({ severity: "info" }), aResult({ severity: "error" }), aResult({ severity: "warning" })]);
    expect(sorted.map((result) => result.severity)).toEqual(["error", "warning", "info"]);
  });
});

describe("TaxReturnDetailScreen", () => {
  it("shows the year, status and every section", async () => {
    serve();
    await show();
    expect(await screen.findByText("2025 tax return")).toBeTruthy();
    expect(screen.getByText(TAX_RETURN_STATUS_LABELS.draft)).toBeTruthy();
    expect(await screen.findByText("Rents look low")).toBeTruthy();
    expect(screen.getByText(new RegExp(`^${SEVERITY_LABELS.warning}`))).toBeTruthy();
    expect(await screen.findByText("Airbnb")).toBeTruthy();
    expect(await screen.findByText(TAX_DOCUMENTS_MESSAGES.stillWaiting)).toBeTruthy();
  });

  it("says when a return was filed", async () => {
    serve({ taxReturn: aReturn({ status: "filed", filed_at: "2026-03-10T12:00:00Z" }) });
    await show();
    expect(await screen.findByText(MESSAGES.filedOn(formatLongDate("2026-03-10T12:00:00Z")))).toBeTruthy();
  });

  it("opens a document and sends a missing one to the camera", async () => {
    serve();
    await show();
    await fireEvent.press(await screen.findByText("Airbnb"));
    expect(mockPush).toHaveBeenCalledWith("/documents/d1");
    await fireEvent.press(screen.getByLabelText(new RegExp(`^${TAX_DOCUMENTS_MESSAGES.addIt}`)));
    expect(mockPush).toHaveBeenCalledWith("/camera");
  });

  it("links each form to that form on the website", async () => {
    serve();
    await show();
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await fireEvent.press(await screen.findByText(new RegExp(MESSAGES.fieldCount(12))));
    expect(open).toHaveBeenLastCalledWith(`${WEB_BASE_URL}/tax-returns/r1?form=schedule_e`);
    await fireEvent.press(screen.getByText(MESSAGES.webLink));
    expect(open).toHaveBeenLastCalledWith(`${WEB_BASE_URL}/tax-returns/r1`);
  });

  it("tells a missing return apart from one that failed to load", async () => {
    serve({ failing: { return: 404 } });
    await show();
    expect(await screen.findByText(MESSAGES.couldntFind)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.tryAgain)).toBeNull();
  });

  it("says a return is gone when it's deleted while I'm looking at it, not that it's showing old numbers", async () => {
    const server = serve();
    await show();
    await screen.findByText("2025 tax return");
    server.failing = { return: 404 };
    const { refreshControl } = screen.getByTestId("tax-return-detail").props;
    await act(async () => {
      await refreshControl.props.onRefresh();
    });
    expect(await screen.findByText(MESSAGES.couldntFind)).toBeTruthy();
    expect(screen.queryByText(SHOWING_LAST_LOADED_MESSAGE)).toBeNull();
  });

  it("shows a section as loading, not blank or empty, until it answers", async () => {
    serve({ hanging: "forms", forms: [] });
    await show();
    await screen.findByText("2025 tax return");
    expect(screen.getByLabelText(MESSAGES.loadingSection)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noForms)).toBeNull();
  });

  it("offers a retry when the return failed to load for any other reason", async () => {
    const server = serve({ failing: { return: 500 } });
    await show();
    expect(await screen.findByText(MESSAGES.couldntLoadOne)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.couldntFind)).toBeNull();
    server.failing = {};
    await fireEvent.press(screen.getByText(MESSAGES.tryAgain));
    expect(await screen.findByText("2025 tax return")).toBeTruthy();
  });

  it.each<[Part, string]>([
    ["validation", MESSAGES.noAttention],
    ["documents", MESSAGES.noDocuments],
    ["forms", MESSAGES.noForms],
  ])("a failed %s section says so, never reads as empty, and leaves the page working", async (part, emptyMessage) => {
    serve({ failing: { [part]: 500 }, validation: [], documents: { documents: [], checklist: [] }, forms: [] });
    await show();
    expect(await screen.findByText(MESSAGES.couldntLoadSection)).toBeTruthy();
    expect(screen.queryByText(emptyMessage)).toBeNull();
    expect(screen.getByText("2025 tax return")).toBeTruthy();
  });

  it("recalculates and says it worked", async () => {
    const server = serve({ taxReturn: aReturn({ needs_recompute: true }) });
    await show();
    await fireEvent.press(await screen.findByText(MESSAGES.recalculate));
    expect(await screen.findByText(MESSAGES.recalculated)).toBeTruthy();
    expect(server.recomputes).toBe(1);
    await waitFor(() => expect(screen.queryByText(MESSAGES.outOfDateDetail)).toBeNull());
  });

  it("only recalculates once on a double press", async () => {
    let answer = (): void => undefined;
    const server = serve({ recomputeGate: new Promise((resolve) => (answer = resolve)) });
    await show();
    const button = await screen.findByRole("button", { name: MESSAGES.recalculate });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(screen.getByText(MESSAGES.recalculating)).toBeTruthy();
    answer();
    expect(await screen.findByText(MESSAGES.recalculated)).toBeTruthy();
    expect(server.recomputes).toBe(1);
  });

  it("says so when recalculating fails", async () => {
    serve({ failing: { recompute: 500 } });
    await show();
    await fireEvent.press(await screen.findByText(MESSAGES.recalculate));
    expect(await screen.findByText(MESSAGES.couldntRecalculate)).toBeTruthy();
  });

  it("asks first on a filed return and does nothing if I cancel", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const server = serve({ taxReturn: aReturn({ status: "filed", filed_at: "2026-03-10T12:00:00Z" }) });
    await show();
    await fireEvent.press(await screen.findByText(MESSAGES.recalculate));
    expect(alert).toHaveBeenCalledWith(MESSAGES.filedTitle, MESSAGES.filedBody, expect.any(Array), expect.any(Object));
    expect(server.recomputes).toBe(0);
  });

  it("asks only once when a filed return is pressed twice, and can ask again after a cancel", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    serve({ taxReturn: aReturn({ status: "filed", filed_at: "2026-03-10T12:00:00Z" }) });
    await show();
    const button = await screen.findByRole("button", { name: MESSAGES.recalculate });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(alert).toHaveBeenCalledTimes(1);
    (alert.mock.calls[0][2] ?? []).find((choice) => choice.text === MESSAGES.cancel)?.onPress?.();
    await fireEvent.press(button);
    expect(alert).toHaveBeenCalledTimes(2);
  });

  it("recalculates a filed return once confirmed", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const server = serve({ taxReturn: aReturn({ status: "filed", filed_at: "2026-03-10T12:00:00Z" }) });
    await show();
    await fireEvent.press(await screen.findByText(MESSAGES.recalculate));
    const buttons = alert.mock.calls[0][2] ?? [];
    buttons.find((button) => button.text === MESSAGES.recalculateAnyway)?.onPress?.();
    await waitFor(() => expect(server.recomputes).toBe(1));
  });

  it("hides recalculating from anyone who isn't an owner or admin, and says why when it matters", async () => {
    jest.mocked(useIsAdmin).mockReturnValue(false);
    serve({ taxReturn: aReturn({ needs_recompute: true }) });
    await show();
    expect(await screen.findByText(MESSAGES.adminsOnly)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.recalculate)).toBeNull();
  });

  it("doesn't mention admins when the numbers are current", async () => {
    jest.mocked(useIsAdmin).mockReturnValue(false);
    serve();
    await show();
    await screen.findByText("2025 tax return");
    expect(screen.queryByText(MESSAGES.adminsOnly)).toBeNull();
  });
});
