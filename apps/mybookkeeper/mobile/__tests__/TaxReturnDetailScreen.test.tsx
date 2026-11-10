import { TAX_RETURN_STATUS_LABELS } from "@mybookkeeper/api-client/constants/taxReturnLabels";
import type { FormOverviewItem } from "@mybookkeeper/api-client/types/tax/FormOverviewItem";
import type { SourceDocumentsResponse } from "@mybookkeeper/api-client/types/tax/SourceDocumentsResponse";
import type { TaxAdvisorCachedResponse } from "@mybookkeeper/api-client/types/tax/TaxAdvisorCachedResponse";
import type { TaxReturn } from "@mybookkeeper/api-client/types/tax/TaxReturn";
import type { ValidationResult } from "@mybookkeeper/api-client/types/tax/ValidationResult";
import { formatLongDate } from "@mybookkeeper/api-client/utils/inquiryDateFormat";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE, ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { Alert, Linking } from "react-native";
import { Provider } from "react-redux";
import { WEB_BASE_URL } from "../src/constants/api";
import { TAX_ADVISOR_MESSAGES } from "../src/constants/taxAdvisor";
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

type Part = "return" | "validation" | "documents" | "forms" | "recompute" | "advisor";

interface Server {
  taxReturn: TaxReturn;
  validation: ValidationResult[];
  documents: SourceDocumentsResponse;
  forms: FormOverviewItem[];
  advisor: TaxAdvisorCachedResponse | null;
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
  if (url.endsWith("/advisor")) return "advisor";
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
    advisor: null,
    failing: {},
    recomputes: 0,
    ...overrides,
  };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    const part = partOf(config.url ?? "");
    if (part === server.hanging) return new Promise(() => undefined);
    const failure = server.failing[part] ?? (part === "advisor" && !server.advisor ? 404 : undefined);
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
      advisor: server.advisor,
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
    expect(screen.getByText(`${TAX_RETURN_STATUS_LABELS.draft} \u00b7 Single`)).toBeTruthy();
    expect(await screen.findByText("Rents look low")).toBeTruthy();
    expect(screen.getByText(new RegExp(`^${SEVERITY_LABELS.warning}`))).toBeTruthy();
    expect(await screen.findByText("Airbnb")).toBeTruthy();
    expect(await screen.findByText(TAX_DOCUMENTS_MESSAGES.stillWaiting)).toBeTruthy();
  });

  it("says when a return was filed", async () => {
    serve({ taxReturn: aReturn({ status: "filed", filed_at: "2026-03-10T12:00:00Z" }) });
    await show();
    expect(await screen.findByText(`${MESSAGES.filedOn(formatLongDate("2026-03-10T12:00:00Z"))} \u00b7 Single`)).toBeTruthy();
  });

  it("opens a document and sends a missing one to the camera", async () => {
    serve();
    await show();
    await fireEvent.press(await screen.findByText("Airbnb"));
    expect(mockPush).toHaveBeenCalledWith("/documents/d1");
    await fireEvent.press(screen.getByLabelText(new RegExp(`^${TAX_DOCUMENTS_MESSAGES.addIt}`)));
    expect(mockPush).toHaveBeenCalledWith("/camera");
  });

  it("shows the filing status, and each form with its counts and how its checks came out", async () => {
    serve();
    await show();
    expect(await screen.findByText(/Single$/)).toBeTruthy();
    expect(await screen.findByText(`${MESSAGES.instanceCount(1)} \u00b7 ${MESSAGES.fieldCount(12)}`)).toBeTruthy();
    expect(screen.getByText("1 warning")).toBeTruthy();
  });

  it("opens a form from its row, and from a check that is about it", async () => {
    serve();
    await show();
    await fireEvent.press(await screen.findByLabelText(new RegExp(MESSAGES.fieldCount(12))));
    expect(mockPush).toHaveBeenLastCalledWith("/tax-returns/r1/form/schedule_e");
    await fireEvent.press(await screen.findByText("Rents look low"));
    expect(mockPush).toHaveBeenLastCalledWith("/tax-returns/r1/form/schedule_e");
  });

  it("shows what a check expected and what it found", async () => {
    serve({ validation: [aResult({ expected_value: 1000, actual_value: 800 })] });
    await show();
    expect(await screen.findByText(MESSAGES.expectedActual("$1,000.00", "$800.00"))).toBeTruthy();
  });

  it("keeps a link to the return on the website", async () => {
    serve();
    await show();
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await fireEvent.press(await screen.findByText(MESSAGES.webLink));
    expect(open).toHaveBeenLastCalledWith(`${WEB_BASE_URL}/tax-returns/r1`);
  });

  it.each<[string, TaxAdvisorCachedResponse | null, string]>([
    ["none yet", null, TAX_ADVISOR_MESSAGES.entryNone],
    ["nothing to flag", { suggestions: [], disclaimer: "d", generated_at: null, model_version: null }, TAX_ADVISOR_MESSAGES.entryEmpty],
  ])("glances at the advisor when there is %s, and opens it", async (_name, advisor, line) => {
    serve({ advisor });
    await show();
    expect(await screen.findByText(line)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(new RegExp(`^${TAX_ADVISOR_MESSAGES.title}`)));
    expect(mockPush).toHaveBeenLastCalledWith("/tax-returns/r1/advisor");
  });

  it("doesn't tell a viewer to get advice they can't ask for", async () => {
    jest.mocked(useIsAdmin).mockReturnValue(false);
    serve({ advisor: null });
    await show();
    expect(await screen.findByText(TAX_ADVISOR_MESSAGES.entryNoneViewer)).toBeTruthy();
    expect(screen.queryByText(TAX_ADVISOR_MESSAGES.entryNone)).toBeNull();
  });

  it("counts the advice still waiting, and says when none is", async () => {
    const suggestion = { id: "s", db_id: "a", status: "active", severity: "high", category: "c", title: "t", description: "d", estimated_savings: null, action: "a", irs_reference: null, confidence: "high", affected_properties: null, affected_form: null, status_changed_at: null, generation_id: "g" } as const;
    serve({ advisor: { suggestions: [suggestion, { ...suggestion, db_id: "b" }, { ...suggestion, db_id: "c", status: "dismissed" }], disclaimer: "d", generated_at: null, model_version: null } });
    await show();
    expect(await screen.findByText(TAX_ADVISOR_MESSAGES.entryCount(2))).toBeTruthy();
  });

  it("says nothing about the advisor when it fails, instead of claiming there is none", async () => {
    serve({ failing: { advisor: 500 } });
    await show();
    await screen.findByText("2025 tax return");
    expect(screen.queryByText(TAX_ADVISOR_MESSAGES.entryNone)).toBeNull();
    expect(screen.queryByText(TAX_ADVISOR_MESSAGES.entryEmpty)).toBeNull();
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
