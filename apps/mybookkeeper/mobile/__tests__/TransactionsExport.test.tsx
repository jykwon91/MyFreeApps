import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Provider } from "react-redux";
import { NO_FILTERS } from "../src/constants/transactionFilters";
import TransactionsScreen from "../src/features/transactions/TransactionsScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import type { TransactionFilters } from "../src/types/TransactionFilters";
import { fakeDownloads, fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { aTransaction, startTransactionServer } from "../test-support/transactionsServer";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: () => undefined,
}));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
  resetFakeFiles();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

function Harness({ initial }: { initial: TransactionFilters }) {
  const [filters, setFilters] = useState(initial);
  return <TransactionsScreen filters={filters} onFiltersChange={setFilters} onVendorChange={() => undefined} />;
}

async function renderScreen(initial: TransactionFilters = NO_FILTERS) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <Harness initial={initial} />
      </ToastProvider>
    </Provider>,
  );
}

async function openSheet(): Promise<void> {
  await fireEvent.press(await screen.findByRole("button", { name: "Export the transactions shown" }));
}

describe("exporting transactions from the Money tab", () => {
  it("offers CSV and PDF, saying the filters are what's exported", async () => {
    startTransactionServer([aTransaction()]);
    await renderScreen();
    await openSheet();
    expect(screen.getByText("Export transactions")).toBeTruthy();
    expect(screen.getByText("Exports what the filters show.")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "CSV spreadsheet" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "PDF report" })).toBeTruthy();
  });

  it("downloads the CSV with the current filters, opens the share sheet, and removes the copy", async () => {
    startTransactionServer([aTransaction()]);
    await renderScreen({ ...NO_FILTERS, month: "2026-03", type: "expense", propertyId: "p1", approvedOnly: true, category: "maintenance" });
    await openSheet();
    await fireEvent.press(screen.getByRole("radio", { name: "CSV spreadsheet" }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    expect(fakeDownloads()[0]).toMatch(
      /\/exports\/transactions\/csv\?property_id=p1&status=approved&transaction_type=expense&category=maintenance&start_date=2026-03-01&end_date=2026-03-31$/,
    );
    expect(jest.mocked(Sharing.shareAsync).mock.calls[0]?.[0]).toMatch(/transactions\.csv$/);
    expect(jest.mocked(Sharing.shareAsync).mock.calls[0]?.[1]).toMatchObject({ mimeType: "text/csv" });
    await waitFor(() => expect(fakeFiles()).toEqual([]));
  });

  it("downloads the PDF the same way", async () => {
    startTransactionServer([aTransaction()]);
    await renderScreen();
    await openSheet();
    await fireEvent.press(screen.getByRole("radio", { name: "PDF report" }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    expect(fakeDownloads()[0]).toMatch(/\/exports\/transactions\/pdf$/);
    expect(jest.mocked(Sharing.shareAsync).mock.calls[0]?.[1]).toMatchObject({ mimeType: "application/pdf" });
  });

  it("sends the vendor search and the review list too, so nothing the list narrows by is dropped", async () => {
    startTransactionServer([aTransaction()]);
    await renderScreen({ ...NO_FILTERS, view: "review", vendor: "Home" });
    await openSheet();
    await fireEvent.press(screen.getByRole("radio", { name: "CSV spreadsheet" }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    expect(fakeDownloads()[0]).toMatch(/\/exports\/transactions\/csv\?.*to_review=true/);
    expect(fakeDownloads()[0]).toMatch(/[?&]vendor=Home(&|$)/);
    expect(screen.queryByText(/Not applied/)).toBeNull();
  });

  it("renews the sign-in first, since the download skips the API client", async () => {
    const server = startTransactionServer([aTransaction()]);
    await renderScreen();
    await screen.findByText("Home Depot");
    const reads = () => server.requests.filter((request) => request.url === "/properties").length;
    const before = reads();
    await openSheet();
    await fireEvent.press(screen.getByRole("radio", { name: "CSV spreadsheet" }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    expect(reads()).toBe(before + 1);
  });

  it("shows loading on the Export button at once and ignores a second export while one is under way", async () => {
    startTransactionServer([aTransaction()]);
    jest.mocked(Sharing.shareAsync).mockImplementation(() => new Promise(() => undefined));
    await renderScreen();
    await openSheet();
    await fireEvent.press(screen.getByRole("radio", { name: "CSV spreadsheet" }));
    expect(await screen.findByText("Exporting…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export the transactions shown" }).props.accessibilityState).toMatchObject({ disabled: true });
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    expect(fakeDownloads()).toHaveLength(1);
  });

  it("says so when the CSV can't be made, and lets the person try again", async () => {
    startTransactionServer([aTransaction()]);
    jest.spyOn(File, "downloadFileAsync").mockRejectedValueOnce(new Error("Request failed"));
    await renderScreen();
    await openSheet();
    await fireEvent.press(screen.getByRole("radio", { name: "CSV spreadsheet" }));
    expect(await screen.findByText("I couldn't export the CSV. Please try again in a bit.")).toBeTruthy();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Export the transactions shown" }).props.accessibilityState).not.toMatchObject({ disabled: true });
    await openSheet();
    await fireEvent.press(screen.getByRole("radio", { name: "CSV spreadsheet" }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
  });

  it("says so when the PDF can't be made", async () => {
    startTransactionServer([aTransaction()]);
    jest.spyOn(File, "downloadFileAsync").mockRejectedValueOnce(new Error("Request failed"));
    await renderScreen();
    await openSheet();
    await fireEvent.press(screen.getByRole("radio", { name: "PDF report" }));
    expect(await screen.findByText("I couldn't export the PDF. Please try again in a bit.")).toBeTruthy();
  });

  it("tells the person when they've hit the hourly export limit", async () => {
    startTransactionServer([aTransaction()]);
    jest.spyOn(File, "downloadFileAsync").mockRejectedValueOnce(new Error("Request failed with status code 429"));
    await renderScreen();
    await openSheet();
    await fireEvent.press(screen.getByRole("radio", { name: "CSV spreadsheet" }));
    expect(await screen.findByText("I've made a lot of exports this hour. Try again in a bit.")).toBeTruthy();
  });

  it("says so when the sign-in can't be renewed, without downloading", async () => {
    const server = startTransactionServer([aTransaction()]);
    await renderScreen();
    await screen.findByText("Home Depot");
    server.offline = true;
    await openSheet();
    await fireEvent.press(screen.getByRole("radio", { name: "CSV spreadsheet" }));
    expect(await screen.findByText("I couldn't export the CSV. Please try again in a bit.")).toBeTruthy();
    expect(fakeDownloads()).toHaveLength(0);
  });

  it("is offered to a viewer, who can read everything", async () => {
    const server = startTransactionServer([aTransaction()]);
    server.role = "viewer";
    await renderScreen();
    await openSheet();
    expect(screen.getByRole("radio", { name: "CSV spreadsheet" })).toBeTruthy();
  });
});
