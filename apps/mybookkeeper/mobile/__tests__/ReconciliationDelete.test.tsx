import type { ReconciliationSource } from "@mybookkeeper/api-client/types/reconciliation/reconciliation-source";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import type { ReactNode } from "react";
import { Alert, type AlertButton } from "react-native";
import { Provider } from "react-redux";
import ReconciliationScreen from "../src/features/reconciliation/ReconciliationScreen";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { store } from "../src/lib/store";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { back: jest.fn(), push: jest.fn() },
  usePreventRemove: () => undefined,
}));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: jest.fn() }));

const originalAdapter = api.defaults.adapter;
const LAST_YEAR = new Date().getFullYear() - 1;
const SOURCE: ReconciliationSource = {
  id: "s1",
  organization_id: "o1",
  user_id: "u1",
  document_id: null,
  source_type: "1099_k",
  tax_year: LAST_YEAR,
  issuer: "Typo Inc",
  reported_amount: "1234.00",
  matched_amount: "0.00",
  discrepancy: "1234.00",
  status: "unmatched",
  created_at: "2026-02-01T12:00:00Z",
  document_file_name: null,
  property_name: null,
};
const LABEL = "Delete the 1099 from Typo Inc";

function serve(deleteStatus = 204) {
  const server = { deletes: [] as string[], gone: false };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    const respond = (status: number, data: unknown) => {
      const response = { data, status, statusText: "", headers: {}, config } as never;
      if (status >= 400) throw Object.assign(new Error("refused"), { isAxiosError: true, response, config });
      return response;
    };
    if (config.method === "delete") {
      server.deletes.push(config.url ?? "");
      if (deleteStatus < 400) server.gone = true;
      return respond(deleteStatus, "");
    }
    return respond(200, server.gone ? [] : [SOURCE]);
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

function lastAlertButton(text: string): AlertButton {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? [];
  const button = buttons.find((b) => b.text === text);
  if (!button) throw new Error(`no ${text} button`);
  return button;
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  jest.mocked(useCanWrite).mockReturnValue(true);
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("deleting a 1099 on the phone", () => {
  it("asks first, then deletes it and takes it off the list", async () => {
    const server = serve();
    await showList();

    await fireEvent.press(screen.getByLabelText(LABEL));
    expect(server.deletes).toEqual([]);
    expect(jest.mocked(Alert.alert).mock.calls[0][0]).toBe("Delete this 1099?");
    await act(async () => lastAlertButton("Delete").onPress?.());
    await settle();

    expect(server.deletes).toEqual(["/reconciliation/sources/s1"]);
    expect(screen.getByText("Deleted that 1099.")).toBeTruthy();
    expect(screen.queryByText("1099-K · Typo Inc")).toBeNull();
  });

  it("leaves it alone when the host cancels", async () => {
    const server = serve();
    await showList();

    await fireEvent.press(screen.getByLabelText(LABEL));
    await act(async () => lastAlertButton("Cancel").onPress?.());
    await settle();

    expect(server.deletes).toEqual([]);
    expect(screen.getByText("1099-K · Typo Inc")).toBeTruthy();
  });

  it("says so when the delete fails", async () => {
    serve(500);
    await showList();

    await fireEvent.press(screen.getByLabelText(LABEL));
    await act(async () => lastAlertButton("Delete").onPress?.());
    await settle();

    expect(screen.getByText("I couldn't delete that 1099. Want to try again?")).toBeTruthy();
    expect(screen.getByText("1099-K · Typo Inc")).toBeTruthy();
  });

  it("doesn't offer delete to read-only people", async () => {
    jest.mocked(useCanWrite).mockReturnValue(false);
    serve();
    await showList();

    expect(screen.getByText("1099-K · Typo Inc")).toBeTruthy();
    expect(screen.queryByLabelText(LABEL)).toBeNull();
  });
});
