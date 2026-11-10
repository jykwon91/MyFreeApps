import { reconciliationApi } from "@mybookkeeper/api-client/store/reconciliationApi";
import type { ReconciliationSource } from "@mybookkeeper/api-client/types/reconciliation/reconciliation-source";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import type { ReactNode } from "react";
import { Alert } from "react-native";
import { reconciliationTaxYears } from "@mybookkeeper/api-client/utils/reconciliationTaxYears";
import { compareFailureMessage, compareResultMessage } from "@mybookkeeper/api-client/utils/reconciliationCompare";
import { Provider } from "react-redux";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { RECONCILIATION_MESSAGES as MESSAGES } from "../src/constants/reconciliation";
import ReconciliationAddScreen from "../src/features/reconciliation/ReconciliationAddScreen";
import {
  differenceLine,
  formYear,
  reportedAmountError,
  rowLabel,
  sourceTitle,
} from "../src/features/reconciliation/reconciliationDisplay";
import { addFailureMessage } from "../src/features/reconciliation/reconciliationFailure";
import ReconciliationScreen from "../src/features/reconciliation/ReconciliationScreen";
import { useCompareWithRecords } from "../src/features/reconciliation/useCompareWithRecords";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { store } from "../src/lib/store";
import { holdWrites } from "../test-support/holdWrites";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockDispatch = jest.fn();
const mockPreventRemove = { active: false, callback: null as null | ((event: { repeat: () => void }) => void) };
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { back: () => mockBack(), push: (path: string) => mockPush(path) },
  usePreventRemove: (active: boolean, callback: (event: { repeat: () => void }) => void) => {
    mockPreventRemove.active = active;
    mockPreventRemove.callback = callback;
  },
}));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: jest.fn() }));
// The mocked answer drives the guard too, so these tests need no workspace list.
jest.mock("../src/features/workspace/useWriteAccess", () => ({
  useWriteAccess: () => (jest.requireMock("../src/features/workspace/useCanWrite").useCanWrite() ? "allowed" : "denied"),
}));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;
const LAST_YEAR = new Date().getFullYear() - 1;
const EARLIER_YEAR = LAST_YEAR - 1;

function aSource(overrides: Partial<ReconciliationSource> = {}): ReconciliationSource {
  return {
    id: "s1",
    organization_id: "o1",
    user_id: "u1",
    document_id: null,
    source_type: "1099_k",
    tax_year: LAST_YEAR,
    issuer: "Airbnb",
    reported_amount: "12000.00",
    matched_amount: "0.00",
    discrepancy: "12000.00",
    status: "unmatched",
    created_at: "2026-02-01T12:00:00Z",
    document_file_name: null,
    property_name: null,
    ...overrides,
  };
}

const differs = aSource({ id: "s2", issuer: "Vrbo", status: "partial", matched_amount: "11500.00", discrepancy: "500.00" });
const matches = aSource({ id: "s3", issuer: "Booking", status: "matched", matched_amount: "12000.00", discrepancy: "0.00" });

interface Server {
  byYear: Record<number, ReconciliationSource[]>;
  sent: { url: string; body: unknown; params: unknown }[];
  reads: number[];
  listStatus?: number;
  replyStatus?: number;
  dead?: boolean;
  deadOnWrite?: boolean;
  never?: boolean;
  compareResult: { sources_checked: number; auto_matched: number; discrepancies: number };
}

function serve(byYear: Record<number, ReconciliationSource[]>): Server {
  const server: Server = { byYear, sent: [], reads: [], compareResult: { sources_checked: 2, auto_matched: 1, discrepancies: 1 } };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    const respond = (status: number, data: unknown) => {
      const response = { data, status, statusText: "", headers: {}, config } as never;
      if (status >= 400) throw Object.assign(new Error("refused"), { isAxiosError: true, response, config });
      return response;
    };
    if (server.never) return new Promise(() => undefined);
    if (server.dead) throw Object.assign(new Error("Network Error"), { isAxiosError: true, config });
    if (config.method === "get") {
      const year = (config.params as { tax_year: number }).tax_year;
      server.reads.push(year);
      return server.listStatus ? respond(server.listStatus, {}) : respond(200, server.byYear[year] ?? []);
    }
    if (server.deadOnWrite) throw Object.assign(new Error("Network Error"), { isAxiosError: true, config });
    server.sent.push({ url: config.url ?? "", body: config.data ? JSON.parse(config.data as string) : undefined, params: config.params });
    if (server.replyStatus) return respond(server.replyStatus, {});
    return config.url === "/reconciliation/auto-reconcile" ? respond(200, server.compareResult) : respond(201, aSource());
  };
  api.defaults.adapter = adapter;
  return server;
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{children}</ToastProvider>
    </Provider>
  );
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function showList(): Promise<void> {
  await render(<ReconciliationScreen />, { wrapper });
  await settle();
}

async function chooseYear(year: number): Promise<void> {
  await fireEvent.press(screen.getByLabelText(`${MESSAGES.taxYear}, ${LAST_YEAR}`));
  await fireEvent.press(screen.getByText(String(year)));
  await settle();
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  jest.mocked(useCanWrite).mockReturnValue(true);
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  mockBack.mockClear();
  mockPush.mockClear();
  mockDispatch.mockClear();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("what a row says", () => {
  it("doesn't call the whole form a gap before it's been compared", () => {
    expect(differenceLine(aSource())).toBeNull();
    expect(rowLabel(aSource())).not.toContain(MESSAGES.inMyRecords);
  });

  it("says which way a compared form differs", () => {
    expect(differenceLine(differs)).toBe("$500.00 more on the form");
    expect(differenceLine({ ...differs, discrepancy: "-500.00" })).toBe("$500.00 less on the form");
    expect(differenceLine(matches)).toBeNull();
  });

  it("speaks the amounts and the status, so colour and layout aren't needed", () => {
    expect(rowLabel(differs)).toBe("1099-K Vrbo, Reported 12,000 dollars, In my records 11,500 dollars, 500 dollars more on the form, Partly matched");
  });

  it("names forms with no issuer by their file, then their type", () => {
    expect(sourceTitle(aSource({ issuer: null, source_type: "year_end_statement", document_file_name: "2025.pdf" }))).toBe("2025.pdf");
    expect(sourceTitle(aSource({ issuer: null, source_type: "1099_nec" }))).toBe("1099-NEC");
    expect(sourceTitle(aSource({ issuer: null, source_type: "something_new" }))).toBe(MESSAGES.taxForm);
  });
});

describe("tax years", () => {
  it("offers last year and the two before it", () => {
    expect(reconciliationTaxYears(new Date(2026, 0, 1))).toEqual([2025, 2024, 2023]);
  });

  it("only takes a year it offers from a link", () => {
    const today = new Date(2026, 5, 1);
    expect(formYear("2024", today)).toBe(2024);
    expect(formYear("1999", today)).toBe(2025);
    expect(formYear("nonsense", today)).toBe(2025);
    expect(formYear(undefined, today)).toBe(2025);
  });
});

describe("what comparing reports", () => {
  it.each([
    [{ sources_checked: 2, auto_matched: 1, discrepancies: 1 }, "1 matched, 1 differs."],
    [{ sources_checked: 3, auto_matched: 1, discrepancies: 2 }, "1 matched, 2 differ."],
    [{ sources_checked: 3, auto_matched: 1, discrepancies: 1 }, "1 matched, 1 differs. 1 had nothing to compare."],
    [{ sources_checked: 2, auto_matched: 0, discrepancies: 0 }, MESSAGES.nothingFound],
  ])("%j", (result, message) => {
    expect(compareResultMessage(result)).toBe(message);
  });
});

describe("refusals", () => {
  const status = (code: number) => ({ status: code, data: { detail: "server wording" } });

  it("warns that a lost reply to adding may still have saved", () => {
    expect(addFailureMessage({ data: undefined })).toBe(MESSAGES.addUnreachable);
    expect(addFailureMessage(status(403))).toBe(MESSAGES.viewerRefused);
    expect(addFailureMessage(status(422))).toBe(MESSAGES.addRejected);
    expect(addFailureMessage(status(504))).toBe(MESSAGES.addUnreachable);
    expect(addFailureMessage(status(500))).toBe(MESSAGES.addFailed);
  });

  it("says a lost reply to comparing is safe to retry", () => {
    expect(compareFailureMessage({ data: undefined })).toBe(MESSAGES.compareUnreachable);
    expect(compareFailureMessage(status(403))).toBe(MESSAGES.viewerRefused);
    expect(compareFailureMessage(status(500))).toBe(MESSAGES.compareFailed);
  });
});

describe("the amount", () => {
  it.each([
    ["", "Enter an amount above $0."],
    ["0", "Enter an amount above $0."],
    ["12.345", "Use dollars and cents, like 84.20."],
    ["1,000", "Use dollars and cents, like 84.20."],
    ["10000000000", MESSAGES.tooLarge],
    ["9999999999.99", undefined],
    [" 84.20 ", undefined],
  ])("%j", (amount, problem) => {
    expect(reportedAmountError(amount)).toBe(problem);
  });
});

describe("the list", () => {
  it("shows the skeleton on the first load", async () => {
    const server = serve({});
    server.never = true;
    await showList();
    expect(screen.getByTestId("reconciliation-skeleton")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.couldntLoad)).toBeNull();
  });

  it("offers to add when the year is empty, and nothing to compare", async () => {
    serve({});
    await showList();
    await fireEvent.press(screen.getByText(MESSAGES.add));
    expect(screen.getByText(`I don't have any 1099s for ${LAST_YEAR} yet.`)).toBeTruthy();
    expect(mockPush).toHaveBeenCalledWith(`/reconciliation/add?year=${LAST_YEAR}`);
    expect(screen.queryByText(MESSAGES.compare)).toBeNull();
  });

  it("says it couldn't load instead of saying there's nothing, and can retry", async () => {
    const server = serve({ [LAST_YEAR]: [differs] });
    server.listStatus = 500;
    await showList();
    expect(screen.getByText(MESSAGES.couldntLoad)).toBeTruthy();
    expect(screen.queryByText(`I don't have any 1099s for ${LAST_YEAR} yet.`)).toBeNull();

    server.listStatus = undefined;
    await fireEvent.press(screen.getByText(MESSAGES.tryAgain));
    await settle();
    expect(screen.getByText("1099-K · Vrbo")).toBeTruthy();
  });

  it("keeps the rows and says so when a refresh fails", async () => {
    const server = serve({ [LAST_YEAR]: [differs] });
    await showList();
    server.listStatus = 500;
    await act(async () => {
      await screen.getByTestId("reconciliation-list").props.refreshControl.props.onRefresh();
    });
    await settle();
    expect(screen.getByText("1099-K · Vrbo")).toBeTruthy();
    expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
  });

  it("doesn't let a failed refresh of an empty year read as having none", async () => {
    const server = serve({});
    await showList();
    server.listStatus = 500;
    await act(async () => {
      await screen.getByTestId("reconciliation-list").props.refreshControl.props.onRefresh();
    });
    await settle();
    expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
  });

  it("counts and filters to what needs a look", async () => {
    serve({ [LAST_YEAR]: [aSource(), differs, matches] });
    await showList();
    expect(screen.getByText("All, 3")).toBeTruthy();

    await fireEvent.press(screen.getByText("Needs a look, 2"));
    expect(screen.getByText("1099-K · Airbnb")).toBeTruthy();
    expect(screen.getByText("1099-K · Vrbo")).toBeTruthy();
    expect(screen.queryByText("1099-K · Booking")).toBeNull();
  });

  it("only says everything matches when it has loaded and it does", async () => {
    serve({ [LAST_YEAR]: [matches] });
    await showList();
    await fireEvent.press(screen.getByText("Needs a look, 0"));
    expect(screen.getByText(`Everything matches for ${LAST_YEAR}.`)).toBeTruthy();
  });

  it("never shows one year's rows under another year", async () => {
    const server = serve({ [LAST_YEAR]: [differs], [EARLIER_YEAR]: [matches] });
    await showList();
    await fireEvent.press(screen.getByLabelText(`${MESSAGES.taxYear}, ${LAST_YEAR}`));
    server.never = true;
    await fireEvent.press(screen.getByText(String(EARLIER_YEAR)));
    await settle();
    expect(screen.queryByText("1099-K · Vrbo")).toBeNull();
    expect(screen.getByTestId("reconciliation-skeleton")).toBeTruthy();
  });

  it("loads the chosen year and goes back to showing all of it", async () => {
    const server = serve({ [LAST_YEAR]: [differs], [EARLIER_YEAR]: [matches] });
    await showList();
    await fireEvent.press(screen.getByText("Needs a look, 1"));
    await chooseYear(EARLIER_YEAR);
    expect(server.reads).toEqual([LAST_YEAR, EARLIER_YEAR]);
    expect(screen.getByText("1099-K · Booking")).toBeTruthy();
  });

  it("gives view-only people the list without the buttons", async () => {
    jest.mocked(useCanWrite).mockReturnValue(false);
    serve({ [LAST_YEAR]: [differs] });
    await showList();
    expect(screen.getByText(MESSAGES.viewOnly)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.compare)).toBeNull();
    expect(screen.queryByText(MESSAGES.add)).toBeNull();
  });

  it("gives view-only people no add button on an empty year", async () => {
    jest.mocked(useCanWrite).mockReturnValue(false);
    serve({});
    await showList();
    expect(screen.getByText(MESSAGES.noneBodyViewer)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.add)).toBeNull();
  });
});

describe("comparing", () => {
  it("compares the chosen year, reports it and reloads the rows", async () => {
    const server = serve({ [LAST_YEAR]: [differs], [EARLIER_YEAR]: [matches] });
    await showList();
    await chooseYear(EARLIER_YEAR);
    server.reads = [];
    server.byYear[EARLIER_YEAR] = [{ ...matches, status: "partial", matched_amount: "1.00", discrepancy: "11999.00" }];

    await fireEvent.press(screen.getByText(MESSAGES.compare));
    await settle();

    expect(server.sent).toEqual([{ url: "/reconciliation/auto-reconcile", body: undefined, params: { tax_year: EARLIER_YEAR } }]);
    expect(screen.getByText(`${EARLIER_YEAR}: 1 matched, 1 differs.`)).toBeTruthy();
    expect(server.reads).toEqual([EARLIER_YEAR]);
    expect(screen.getByText("$11,999.00 more on the form")).toBeTruthy();
  });

  it("reports a failure and keeps the rows", async () => {
    const server = serve({ [LAST_YEAR]: [differs] });
    await showList();
    server.replyStatus = 500;
    await fireEvent.press(screen.getByText(MESSAGES.compare));
    await settle();
    expect(screen.getByText(MESSAGES.compareFailed)).toBeTruthy();
    expect(screen.getByText("1099-K · Vrbo")).toBeTruthy();
  });

  it("sends once for two taps in the same moment", async () => {
    const server = serve({ [LAST_YEAR]: [differs] });
    const { result } = await renderHook(() => useCompareWithRecords(LAST_YEAR), { wrapper });
    await act(async () => {
      void result.current.compare();
      void result.current.compare();
    });
    await settle();
    expect(server.sent).toHaveLength(1);
  });
});

describe("adding", () => {
  const showForm = () => render(<ReconciliationAddScreen year={LAST_YEAR} />, { wrapper });
  const typeInto = (label: string, text: string) => fireEvent.changeText(screen.getByLabelText(label), text);

  it("sends what was entered and goes back", async () => {
    const server = serve({});
    await showForm();
    await fireEvent.press(screen.getByLabelText(`${MESSAGES.type}, 1099-K`));
    await fireEvent.press(screen.getByText("1099-NEC"));
    await typeInto(MESSAGES.issuer, "  Airbnb ");
    await typeInto(MESSAGES.amount, " 84.20 ");

    await fireEvent.press(screen.getByText(MESSAGES.add));
    await settle();

    expect(server.sent).toEqual([
      {
        url: "/reconciliation/upload-1099",
        body: { source_type: "1099_nec", tax_year: LAST_YEAR, issuer: "Airbnb", reported_amount: "84.20" },
        params: undefined,
      },
    ]);
    expect(screen.getByText(MESSAGES.added)).toBeTruthy();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPreventRemove.active).toBe(false);
  });

  it("can't add a second form while the screen slides away", async () => {
    const server = serve({});
    await showForm();
    await typeInto(MESSAGES.amount, "10");
    await fireEvent.press(screen.getByText(MESSAGES.add));
    await settle();
    expect(server.sent).toHaveLength(1);

    await fireEvent.press(screen.getByText(MESSAGES.add));
    await settle();
    expect(server.sent).toHaveLength(1);
  });

  it("can try again after a failure", async () => {
    const server = serve({});
    server.replyStatus = 500;
    await showForm();
    await typeInto(MESSAGES.amount, "10");
    await fireEvent.press(screen.getByText(MESSAGES.add));
    await settle();
    expect(screen.getByText(MESSAGES.addFailed)).toBeTruthy();

    server.replyStatus = undefined;
    await fireEvent.press(screen.getByText(MESSAGES.add));
    await settle();
    expect(server.sent).toHaveLength(2);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("refreshes the list after a lost reply, so going back to check it tells the truth", async () => {
    const server = serve({});
    const list = store.dispatch(reconciliationApi.endpoints.listSources.initiate({ tax_year: LAST_YEAR }));
    await list;
    server.reads = [];
    server.deadOnWrite = true;
    await store.dispatch(reconciliationApi.endpoints.upload1099.initiate({ source_type: "1099_k", tax_year: LAST_YEAR, reported_amount: "1" }));
    await waitFor(() => expect(server.reads).toEqual([LAST_YEAR]));
    list.unsubscribe();
  });

  it("leaves out a blank issuer", async () => {
    const server = serve({});
    await showForm();
    await typeInto(MESSAGES.issuer, "   ");
    await typeInto(MESSAGES.amount, "10");
    await fireEvent.press(screen.getByText(MESSAGES.add));
    await settle();
    expect(server.sent[0]?.body).toEqual({ source_type: "1099_k", tax_year: LAST_YEAR, reported_amount: "10" });
  });

  it("holds a bad amount back and says why, only once they've tried", async () => {
    const server = serve({});
    await showForm();
    expect(screen.queryByText("Enter an amount above $0.")).toBeNull();
    await fireEvent.press(screen.getByText(MESSAGES.add));
    await settle();
    expect(screen.getByText("Enter an amount above $0.")).toBeTruthy();
    expect(server.sent).toEqual([]);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("stays put with what was typed when the reply is lost, and warns about adding twice", async () => {
    const server = serve({});
    server.deadOnWrite = true;
    await showForm();
    await typeInto(MESSAGES.amount, "10");
    await fireEvent.press(screen.getByText(MESSAGES.add));
    await settle();
    expect(screen.getByText(MESSAGES.addUnreachable)).toBeTruthy();
    expect(screen.getByLabelText(MESSAGES.amount).props.value).toBe("10");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("asks before throwing away what was typed", async () => {
    serve({});
    await showForm();
    expect(mockPreventRemove.active).toBe(false);
    await typeInto(MESSAGES.amount, "10");
    expect(mockPreventRemove.active).toBe(true);

    await act(async () => mockPreventRemove.callback?.({ repeat: () => mockDispatch("go-back") }));
    await act(async () => jest.mocked(Alert.alert).mock.lastCall?.[2]?.find((option) => option.text === MESSAGES.discard)?.onPress?.());
    expect(mockDispatch).toHaveBeenCalledWith("go-back");
  });

  it("ignores going back while the form is sending, so Discard can't beat it", async () => {
    serve({});
    await showForm();
    await typeInto(MESSAGES.amount, "10");
    holdWrites();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.add }));
    jest.mocked(Alert.alert).mockClear();
    await act(async () => mockPreventRemove.callback?.({ repeat: () => mockDispatch("go-back") }));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("refreshes the list once a form is added", async () => {
    const server = serve({});
    const list = store.dispatch(reconciliationApi.endpoints.listSources.initiate({ tax_year: LAST_YEAR }));
    await list;
    server.reads = [];
    await store.dispatch(reconciliationApi.endpoints.upload1099.initiate({ source_type: "1099_k", tax_year: LAST_YEAR, reported_amount: "1" }));
    await waitFor(() => expect(server.reads).toEqual([LAST_YEAR]));
    list.unsubscribe();
  });
});
