import "@platform/mobile/test-support/reactNativeFormData";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { Provider } from "react-redux";
import { CANCEL_BATCH_FAILED } from "../src/constants/capture";
import CaptureScreen from "../src/features/capture/CaptureScreen";
import { uploadsReset } from "../src/features/capture/uploadsSlice";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

const mockPickDocuments = jest.fn();

jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("../src/features/aiPermission/aiPermission", () => ({
  ...jest.requireActual("../src/features/aiPermission/aiPermission"),
  hasAiPermission: () => true,
}));
jest.mock("expo-router", () => ({ router: { dismissTo: jest.fn() } }));
jest.mock("expo-camera", () => {
  const { View } = jest.requireActual("react-native");
  return { CameraView: View, useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()] };
});
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: () => mockPickDocuments() }));
jest.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: jest.fn() } }));

const originalAdapter = api.defaults.adapter;

function respond(config: InternalAxiosRequestConfig, data: object, status = 200): Promise<AxiosResponse> {
  return Promise.resolve({ data, status, statusText: "", headers: {}, config });
}

function fail(config: InternalAxiosRequestConfig, status: number): Promise<never> {
  const response = { data: { detail: "boom" }, status, statusText: "", headers: {}, config };
  return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
}

interface FakeServer {
  cancels: string[];
  uploads: string[];
}

/** Sends each upload back as a batch for a zip and a single document for anything else. */
function startServer({ batchStatus = "processing", cancelStatus = 200 }: { batchStatus?: string; cancelStatus?: number } = {}): FakeServer {
  const server: FakeServer = { cancels: [], uploads: [] };
  const adapter: AxiosAdapter = (config) => {
    const url = config.url ?? "";
    if (url === "/documents/upload") {
      const name = (config.data as unknown as { getParts: () => { name: string }[] }).getParts()[0].name;
      server.uploads.push(name);
      const batchId = name.endsWith(".zip") ? "batch-1" : null;
      return respond(config, { document_id: "d1", batch_id: batchId, batch_total: batchId ? 4 : 1 }, 202);
    }
    if (url === "/documents/batch-status/batch-1") {
      return respond(config, { batch_id: "batch-1", total: 4, completed: 1, failed: 0, status: batchStatus });
    }
    if (url.startsWith("/documents/batch-cancel/")) {
      server.cancels.push(url.slice("/documents/batch-cancel/".length));
      return cancelStatus === 200 ? respond(config, { cancelled: 3 }) : fail(config, cancelStatus);
    }
    return fail(config, 404);
  };
  api.defaults.adapter = adapter;
  return server;
}

async function sendFile(name: string): Promise<void> {
  const uri = `cache:/${name}`;
  resetFakeFiles([...fakeFiles(), uri]);
  mockPickDocuments.mockResolvedValue({ canceled: false, assets: [{ uri, name, size: 100 }] });
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <CaptureScreen />
      </ToastProvider>
    </Provider>,
  );
  await fireEvent.press(screen.getByRole("button", { name: "Files" }));
}

beforeEach(() => {
  jest.clearAllMocks();
  resetFakeFiles([]);
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(uploadsReset());
  store.dispatch(workspaceChosen("w1"));
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("cancelling a zip being read", () => {
  it("shows how far the read has got, stops that batch on Cancel, and shows it cancelled", async () => {
    const server = startServer();
    await sendFile("receipts.zip");
    expect(await screen.findByLabelText("receipts.zip, Reading…")).toBeTruthy();
    expect(await screen.findByText("1 of 4 read")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Cancel reading receipts.zip" }));

    await waitFor(() => expect(server.cancels).toEqual(["batch-1"]));
    expect(await screen.findByLabelText("receipts.zip, Cancelled")).toBeTruthy();
    expect(await screen.findByText("Stopped. I won't read the rest of receipts.zip.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel reading receipts.zip" })).toBeNull();
  });

  it("says so when the cancel fails, and still offers it", async () => {
    const server = startServer({ cancelStatus: 500 });
    await sendFile("receipts.zip");
    await fireEvent.press(await screen.findByRole("button", { name: "Cancel reading receipts.zip" }));

    expect(await screen.findByText(CANCEL_BATCH_FAILED)).toBeTruthy();
    expect(server.cancels).toEqual(["batch-1"]);
    expect(screen.getByLabelText("receipts.zip, Reading…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel reading receipts.zip" })).toBeTruthy();
  });

  it("stops offering Cancel once every document has been read", async () => {
    startServer({ batchStatus: "done" });
    await sendFile("receipts.zip");
    expect(await screen.findByLabelText("receipts.zip, Sent")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel reading receipts.zip" })).toBeNull();
  });

  it("offers no Cancel for a single file, which isn't read as a batch", async () => {
    const server = startServer();
    await sendFile("bank.csv");
    await waitFor(() => expect(server.uploads).toEqual(["bank.csv"]));
    expect(await screen.findByLabelText("bank.csv, Sent")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Cancel reading/ })).toBeNull();
  });
});
