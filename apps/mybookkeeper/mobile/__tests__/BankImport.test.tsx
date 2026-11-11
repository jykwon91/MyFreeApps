import "@platform/mobile/test-support/reactNativeFormData";
import { useListTransactionsQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { BANK_CSV_MAX_BYTES, BANK_IMPORT_FAILURE_MESSAGES as FAILURES } from "@mybookkeeper/api-client/constants/bankImport";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import * as DocumentPicker from "expo-document-picker";
import { router, Stack } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Alert, Text } from "react-native";
import { Provider } from "react-redux";
import { BANK_IMPORT_MESSAGES as MESSAGES } from "../src/constants/bankImport";
import { useImportBankCsv } from "../src/features/bankImport/useImportBankCsv";
import BankImportScreen from "../src/features/bankImport/BankImportScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { makeStore } from "../src/lib/store";
import { formParts } from "../test-support/applicantsServer";
import { File, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { aProperty, startTransactionServer, type FakeTransactionServer } from "../test-support/transactionsServer";

jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn(), launchCameraAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;
const alert = jest.spyOn(Alert, "alert");
let testStore: ReturnType<typeof makeStore>;

function ListWatcher() {
  const { data } = useListTransactionsQuery({});
  return <Text>{`listed-${data?.length ?? "none"}`}</Text>;
}

async function openImport(): Promise<void> {
  await renderRouter(
    {
      _layout: () => (
        <Provider store={testStore}>
          <ToastProvider bottomOffset={0}>
            <Stack />
          </ToastProvider>
        </Provider>
      ),
      index: () => (
        <>
          <Text>start-screen</Text>
          <ListWatcher />
        </>
      ),
      money: () => <Text>money-screen</Text>,
      "transactions/import": BankImportScreen,
    },
    { initialUrl: "/" },
  );
  await act(async () => {
    router.push("/transactions/import");
  });
}

function pick(name: string, size?: number): void {
  const source = new File(`cache:/DocumentPicker/${name}`);
  source.write("Date,Description,Amount\n");
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: source.uri, name, mimeType: "text/csv", size }],
  } as DocumentPicker.DocumentPickerResult);
}

async function chooseCsv(name = "statement.csv", size?: number): Promise<void> {
  pick(name, size);
  await fireEvent.press(await screen.findByRole("button", { name: new RegExp(`^(${MESSAGES.chooseFile}|${MESSAGES.chooseDifferentFile})$`) }));
}

const importButton = () => screen.findByRole("button", { name: MESSAGES.submit });
const imports = (server: FakeTransactionServer) => server.requests.filter((request) => request.url === "/imports/bank-csv");

beforeEach(() => {
  session.tokenStore.set("token");
  testStore = makeStore();
  testStore.dispatch(workspaceChosen("w1"));
  jest.mocked(DocumentPicker.getDocumentAsync).mockReset();
  resetFakeFiles();
  alert.mockReset();
  alert.mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  testStore.dispatch(baseApi.util.resetApiState());
});

describe("importing a bank statement", () => {
  it("picks a CSV, imports it, and summarises what came in", async () => {
    const server = startTransactionServer([], [aProperty()]);
    await openImport();
    await chooseCsv();
    expect(await screen.findByText("statement.csv")).toBeTruthy();
    await fireEvent.press(await importButton());

    expect(await screen.findByText(MESSAGES.resultHeading)).toBeTruthy();
    expect(screen.getByLabelText(`${MESSAGES.imported}, 2`)).toBeTruthy();
    expect(screen.getByLabelText(`${MESSAGES.duplicates}, 1`)).toBeTruthy();
    expect(screen.getByLabelText(`${MESSAGES.format}, Chase`)).toBeTruthy();
    expect(screen.getByText("Shell")).toBeTruthy();
    expect(screen.getByText("−$40.00")).toBeTruthy();
    expect(screen.getByText("+$1,200.00")).toBeTruthy();
    const [request] = imports(server);
    expect(request.method).toBe("post");
    expect(request.params).toBeUndefined();
    expect(formParts(request.data).filter((part) => part.fieldName === "file").map((part) => part.name)).toEqual(["statement.csv"]);
  });

  it("sends the chosen property", async () => {
    const server = startTransactionServer([], [aProperty({ id: "p9", name: "Elm Court" })]);
    await openImport();
    await chooseCsv();
    await fireEvent.press(await screen.findByRole("button", { name: `${MESSAGES.property}, ${MESSAGES.noProperty}` }));
    await fireEvent.press(await screen.findByText("Elm Court"));
    await fireEvent.press(await importButton());
    await screen.findByText(MESSAGES.resultHeading);
    expect(imports(server)[0].params).toEqual({ property_id: "p9" });
  });

  it("refetches the transaction list, and opens the all view from the result", async () => {
    const server = startTransactionServer([], []);
    await openImport();
    expect(await screen.findByText("listed-0", { includeHiddenElements: true })).toBeTruthy();
    await chooseCsv();
    await fireEvent.press(await importButton());
    await screen.findByText(MESSAGES.resultHeading);
    expect(server.transactions.map((row) => row.status)).toEqual(["approved", "approved"]);
    expect(await screen.findByText("listed-2", { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "View imported transactions" }));
    expect(await screen.findByText("money-screen")).toBeTruthy();
  });

  it("says so when everything in the file was already imported", async () => {
    const server = startTransactionServer([], []);
    server.bankImportResult = { imported: 0, skipped_duplicates: 5, format_detected: "generic", preview: [] };
    await openImport();
    await chooseCsv();
    await fireEvent.press(await importButton());
    expect(await screen.findByText(MESSAGES.nothingNew)).toBeTruthy();
  });

  it("starts over for another statement", async () => {
    startTransactionServer([], []);
    await openImport();
    await chooseCsv();
    await fireEvent.press(await importButton());
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.importAnother }));
    expect(await screen.findByText(MESSAGES.noFile)).toBeTruthy();
  });

  it("shows it's working and imports once however many times it's tapped", async () => {
    startTransactionServer([], []);
    await openImport();
    await chooseCsv();
    const button = await importButton();
    const answer = api.defaults.adapter as AxiosAdapter;
    const sent: string[] = [];
    api.defaults.adapter = (config) => {
      if (config.method?.toLowerCase() === "get") return answer(config);
      sent.push(config.url ?? "");
      return new Promise(() => undefined);
    };
    await fireEvent.press(button);
    expect(screen.getByText(MESSAGES.submitting)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.submitting }));
    expect(sent).toEqual(["/imports/bank-csv"]);
    expect(screen.getByRole("button", { name: MESSAGES.chooseDifferentFile }).props.accessibilityState?.disabled).toBe(true);
  });

  it("sends once when the import is started three times before the screen can react", async () => {
    startTransactionServer([], []);
    const answer = api.defaults.adapter as AxiosAdapter;
    const sent: string[] = [];
    api.defaults.adapter = (config) => {
      if (config.method?.toLowerCase() === "get") return answer(config);
      sent.push(config.url ?? "");
      return new Promise(() => undefined);
    };
    const { result } = await renderHook(() => useImportBankCsv(), { wrapper: ({ children }) => <Provider store={testStore}>{children}</Provider> });
    const file = { uri: "cache:/held/statement.csv", name: "statement.csv", mimeType: "text/csv" };
    await act(async () => {
      void result.current.submit(file, null);
      void result.current.submit(file, null);
      void result.current.submit(file, null);
    });
    expect(sent).toEqual(["/imports/bank-csv"]);
  });

  it("asks for a file instead of sending nothing", async () => {
    const server = startTransactionServer([], []);
    await openImport();
    await fireEvent.press(await importButton());
    expect(await screen.findByText(MESSAGES.needFile)).toBeTruthy();
    expect(imports(server)).toHaveLength(0);
  });

  it("turns away a file over the server's limit without sending it", async () => {
    const server = startTransactionServer([], []);
    await openImport();
    await chooseCsv("huge.csv", BANK_CSV_MAX_BYTES + 1);
    expect(await screen.findByText(MESSAGES.tooBig)).toBeTruthy();
    expect(screen.queryByText("huge.csv")).toBeNull();
    expect(imports(server)).toHaveLength(0);
  });

  it("doesn't let an old import error hide a new problem with the file", async () => {
    const server = startTransactionServer([], []);
    server.bankImportFailure = { status: 500 };
    await openImport();
    await chooseCsv();
    await fireEvent.press(await importButton());
    await screen.findByText(FAILURES.unsure);
    await chooseCsv("notes.pdf");
    expect(await screen.findByText(MESSAGES.notCsv)).toBeTruthy();
    expect(screen.queryByText(FAILURES.unsure)).toBeNull();
  });

  it("turns away a file that isn't a CSV", async () => {
    startTransactionServer([], []);
    await openImport();
    await chooseCsv("statement.pdf");
    expect(await screen.findByText(MESSAGES.notCsv)).toBeTruthy();
  });

  it.each([
    [{ status: 413 }, FAILURES.tooLarge],
    [{ status: 422 }, FAILURES.unreadable],
    [{ status: 400 }, FAILURES.notCsv],
    [{ status: 404 }, FAILURES.other],
    [{ status: 500 }, FAILURES.unsure],
    ["offline" as const, FAILURES.unsure],
  ])("tells it in fixed words when the import fails (%j), keeps the file, and lets me retry", async (failure, message) => {
    const server = startTransactionServer([], []);
    server.bankImportFailure = failure;
    await openImport();
    await chooseCsv();
    await fireEvent.press(await importButton());
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("A developer's message")).toBeNull();
    expect(screen.getByText("statement.csv")).toBeTruthy();

    server.bankImportFailure = null;
    await fireEvent.press(await importButton());
    expect(await screen.findByText(MESSAGES.resultHeading)).toBeTruthy();
    expect(screen.queryByText(message)).toBeNull();
  });

  it("still lets me import when the properties can't load, and tries again", async () => {
    startTransactionServer([], []);
    const answer = api.defaults.adapter as AxiosAdapter;
    let failing = true;
    api.defaults.adapter = (config) =>
      config.url === "/properties" && failing
        ? Promise.reject(Object.assign(new Error("500"), { config, response: { status: 500, data: {}, statusText: "", headers: {}, config }, isAxiosError: true }))
        : answer(config);
    await openImport();
    expect(await screen.findByText(MESSAGES.propertiesFailed)).toBeTruthy();
    failing = false;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByRole("button", { name: /^Property/ })).toBeTruthy();
  });

  it("shows a skeleton while the properties load", async () => {
    startTransactionServer([], []);
    const answer = api.defaults.adapter as AxiosAdapter;
    api.defaults.adapter = (config) => (config.url === "/properties" ? new Promise(() => undefined) : answer(config));
    await openImport();
    expect(await screen.findByLabelText(MESSAGES.loadingProperties)).toBeTruthy();
  });

  it("gives someone who can only read no form", async () => {
    const server = startTransactionServer([], []);
    server.role = "viewer";
    await openImport();
    expect(await screen.findByText(MESSAGES.viewOnly)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.submit })).toBeNull();
  });

  it("asks before throwing away a chosen file", async () => {
    startTransactionServer([], []);
    await openImport();
    await chooseCsv();
    await screen.findByText("statement.csv");
    await act(async () => {
      router.back();
    });
    expect(alert.mock.calls[0][0]).toBe("Discard your changes?");
    await waitFor(() => expect(screen.getByText("statement.csv")).toBeTruthy());
  });
});
