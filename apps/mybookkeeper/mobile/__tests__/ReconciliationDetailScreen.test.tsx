import { RECONCILIATION_DELETE_MESSAGES as DELETE } from "@mybookkeeper/api-client/constants/reconciliationDelete";
import type { ReconciliationSource } from "@mybookkeeper/api-client/types/reconciliation/reconciliation-source";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import type { ReactNode } from "react";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { DOCUMENTS_LINK, RECONCILIATION_MESSAGES as MESSAGES } from "../src/constants/reconciliation";
import ReconciliationAddScreen from "../src/features/reconciliation/ReconciliationAddScreen";
import ReconciliationDetailScreen from "../src/features/reconciliation/ReconciliationDetailScreen";
import ReconciliationScreen from "../src/features/reconciliation/ReconciliationScreen";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { store } from "../src/lib/store";

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { back: () => mockBack(), push: (path: string) => mockPush(path) },
  usePreventRemove: () => undefined,
}));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: jest.fn() }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;
const YEAR = new Date().getFullYear() - 1;

function aSource(overrides: Partial<ReconciliationSource> = {}): ReconciliationSource {
  return {
    id: "s1",
    organization_id: "o1",
    user_id: "u1",
    document_id: "d1",
    source_type: "1099_k",
    tax_year: YEAR,
    issuer: "Airbnb",
    reported_amount: "12000.00",
    matched_amount: "11500.00",
    discrepancy: "500.00",
    status: "partial",
    created_at: "2026-02-01T12:00:00Z",
    document_file_name: "airbnb-1099.pdf",
    property_name: "Oak Street",
    ...overrides,
  };
}

interface Server {
  sources: ReconciliationSource[];
  status: number;
  deletes: string[];
}

function serve(sources: ReconciliationSource[], status = 200): Server {
  const server: Server = { sources, status, deletes: [] };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    const respond = (code: number, data: unknown) => {
      const response = { data, status: code, statusText: "", headers: {}, config } as never;
      if (code >= 400) throw Object.assign(new Error("refused"), { isAxiosError: true, response, config });
      return response;
    };
    if (config.method === "delete") {
      server.deletes.push(config.url ?? "");
      return respond(204, "");
    }
    if (server.status === -1) throw Object.assign(new Error("Network Error"), { isAxiosError: true, config });
    return respond(server.status, server.status >= 400 ? {} : server.sources);
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

async function showDetail(id = "s1"): Promise<void> {
  await render(<ReconciliationDetailScreen id={id} year={YEAR} />, { wrapper });
  await settle();
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  jest.mocked(useCanWrite).mockReturnValue(true);
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  mockBack.mockClear();
  mockPush.mockClear();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("a 1099 in full", () => {
  it("shows every fact the website does", async () => {
    serve([aSource()]);
    await showDetail();
    expect(screen.getByText("1099-K · Airbnb")).toBeTruthy();
    expect(screen.getByText("airbnb-1099.pdf")).toBeTruthy();
    expect(screen.getByText("Oak Street")).toBeTruthy();
    expect(screen.getByText("$11,500.00")).toBeTruthy();
    expect(screen.getByText("$500.00 more on the form")).toBeTruthy();
  });

  it("shows dashes, not zeros, for a form that has not been compared", async () => {
    serve([aSource({ matched_amount: "0.00", discrepancy: "12000.00", status: "unmatched", issuer: null, document_file_name: null, property_name: null })]);
    await showDetail();
    expect(screen.getAllByText(MESSAGES.notCompared).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(MESSAGES.notCompareYet)).toBeTruthy();
  });

  it("opens the source document", async () => {
    serve([aSource()]);
    await showDetail();
    await fireEvent.press(screen.getByText(MESSAGES.openSourceDocument));
    expect(mockPush).toHaveBeenCalledWith("/documents/d1");
  });

  it("has no document to open when it was typed in", async () => {
    serve([aSource({ document_id: null })]);
    await showDetail();
    expect(screen.queryByText(MESSAGES.openSourceDocument)).toBeNull();
  });

  it("shows a skeleton while it loads", async () => {
    api.defaults.adapter = () => new Promise(() => undefined);
    await render(<ReconciliationDetailScreen id="s1" year={YEAR} />, { wrapper });
    expect(screen.getByTestId("reconciliation-detail-skeleton")).toBeTruthy();
  });

  it("says it can't find one that is gone, with a way back", async () => {
    serve([aSource({ id: "other" })]);
    await showDetail();
    expect(screen.getByText(MESSAGES.detailGone)).toBeTruthy();
    await fireEvent.press(screen.getByText(MESSAGES.back));
    expect(mockBack).toHaveBeenCalled();
  });

  it("says it couldn't load, rather than that the form is gone", async () => {
    serve([], 500);
    await showDetail();
    expect(screen.getByText(MESSAGES.couldntLoad)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.detailGone)).toBeNull();
  });

  it("keeps the form and says so when a refresh fails", async () => {
    const server = serve([aSource()]);
    await showDetail();
    server.status = 500;
    await act(async () => {
      await screen.getByTestId("reconciliation-detail").props.refreshControl.props.onRefresh();
    });
    await settle();
    expect(screen.getByText("1099-K · Airbnb")).toBeTruthy();
    expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
  });
});

describe("deleting from the detail", () => {
  it("asks, deletes and goes back", async () => {
    const server = serve([aSource()]);
    await showDetail();
    await fireEvent.press(screen.getByLabelText("Delete the 1099 from Airbnb"));
    const confirm = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]?.find((button) => button.text === DELETE.action);
    await act(async () => confirm?.onPress?.());
    await settle();
    expect(server.deletes).toEqual([`/reconciliation/sources/s1`]);
    expect(mockBack).toHaveBeenCalled();
  });

  it("is hidden from a viewer", async () => {
    jest.mocked(useCanWrite).mockReturnValue(false);
    serve([aSource()]);
    await showDetail();
    expect(screen.queryByLabelText("Delete the 1099 from Airbnb")).toBeNull();
  });
});

describe("getting there", () => {
  it("opens from a row on the list", async () => {
    serve([aSource()]);
    await render(<ReconciliationScreen />, { wrapper });
    await settle();
    await fireEvent.press(screen.getByHintText(MESSAGES.openHint));
    expect(mockPush).toHaveBeenCalledWith(`/reconciliation/s1?year=${YEAR}`);
  });

  it("explains what the list is for", async () => {
    serve([]);
    await render(<ReconciliationScreen />, { wrapper });
    await settle();
    expect(screen.getByText(MESSAGES.infoNote)).toBeTruthy();
  });

  it("tells a viewer they can't add one, instead of showing a form", async () => {
    jest.mocked(useCanWrite).mockReturnValue(false);
    serve([]);
    await render(<ReconciliationAddScreen year={YEAR} />, { wrapper });
    expect(screen.getByText("You have view-only access.")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.pdfHint)).toBeNull();
  });

  it("points a 1099 PDF at Documents", async () => {
    serve([]);
    await render(<ReconciliationAddScreen year={YEAR} />, { wrapper });
    expect(screen.getByText(MESSAGES.pdfHint)).toBeTruthy();
    await fireEvent.press(screen.getByText(MESSAGES.openDocuments));
    expect(mockPush).toHaveBeenCalledWith(DOCUMENTS_LINK);
  });
});
