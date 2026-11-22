import "@platform/mobile/test-support/reactNativeFormData";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { AccessibilityInfo } from "react-native";
import { Provider } from "react-redux";
import CaptureScreen from "../src/features/capture/CaptureScreen";
import { uploadSentSettled, uploadsReset } from "../src/features/capture/uploadsSlice";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

const POLL_MS = 20;
const mockPickDocuments = jest.fn();

jest.mock("../src/constants/capture", () => ({ ...jest.requireActual("../src/constants/capture"), READ_STATUS_POLL_MS: 20 }));
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("../src/features/aiPermission/aiPermission", () => ({
  ...jest.requireActual("../src/features/aiPermission/aiPermission"),
  hasAiPermission: () => true,
}));
jest.mock("expo-router", () => ({ router: { dismissTo: jest.fn(), push: jest.fn() } }));
jest.mock("expo-camera", () => {
  const { View } = jest.requireActual("react-native");
  return { CameraView: View, useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()] };
});
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: () => mockPickDocuments() }));
jest.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: jest.fn() } }));

const originalAdapter = api.defaults.adapter;
const pause = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

function respond(config: InternalAxiosRequestConfig, data: object, status = 200): Promise<AxiosResponse> {
  return Promise.resolve({ data, status, statusText: "", headers: {}, config });
}

interface FakeServer {
  statusChecks: string[];
}

/** Takes the upload as document d1, then answers each check on it with the next status, keeping the last. */
function startServer(statuses: string[]): FakeServer {
  const server: FakeServer = { statusChecks: [] };
  const adapter: AxiosAdapter = (config) => {
    const url = config.url ?? "";
    if (url === "/documents/upload") return respond(config, { document_id: "d1", batch_id: null, batch_total: 1 }, 202);
    if (url.startsWith("/documents/upload-status/")) {
      server.statusChecks.push(url.slice("/documents/upload-status/".length));
      return respond(config, { status: statuses[Math.min(server.statusChecks.length, statuses.length) - 1] });
    }
    return respond(config, { items: [], total: 0, has_more: false });
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
  store.dispatch(baseApi.internalActions.onFocus());
  api.defaults.adapter = originalAdapter;
});

describe("what came of a sent file", () => {
  it("says it was read, the same as the web, once the server has read it", async () => {
    const server = startServer(["processing", "extracting", "completed"]);
    await sendFile("lease.pdf");
    expect(await screen.findByLabelText("lease.pdf, Got it! Check your Transactions page for the extracted data.")).toBeTruthy();
    expect(screen.getByText("Got it! Check your Transactions page for the extracted data.")).toBeTruthy();
    expect(server.statusChecks.every((id) => id === "d1")).toBe(true);
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenCalledWith(
      "lease.pdf, Got it! Check your Transactions page for the extracted data.",
      { queue: true },
    );
  });

  it.each(["duplicate", "skipped", "deleted"])("says there was nothing new to add when the server answers %s", async (status) => {
    startServer(["processing", status]);
    await sendFile("receipt.jpg");
    expect(await screen.findByText("I read it, but there was nothing new to add to your transactions.")).toBeTruthy();
    expect(screen.getByLabelText("receipt.jpg, I read it, but there was nothing new to add to your transactions.")).toBeTruthy();
  });

  it("says it had trouble reading the file when reading it failed, not that it couldn't send it", async () => {
    startServer(["failed"]);
    await sendFile("bank.csv");
    expect(await screen.findByLabelText("bank.csv, I had trouble reading this one.")).toBeTruthy();
    expect(screen.queryByText("Couldn't send")).toBeNull();
  });

  it("takes the line away once it has been up as long as the got-it message", async () => {
    startServer(["skipped"]);
    await sendFile("receipt.jpg");
    await screen.findByText("I read it, but there was nothing new to add to your transactions.");
    await act(async () => {
      store.dispatch(uploadSentSettled());
    });
    expect(screen.queryByText("I read it, but there was nothing new to add to your transactions.")).toBeNull();
    expect(store.getState().uploads.files).toEqual([]);
  });

  it("says it's reading the file until there's an answer", async () => {
    startServer(["processing"]);
    await sendFile("lease.pdf");
    expect(await screen.findByLabelText("lease.pdf, Reading…")).toBeTruthy();
  });

  it("stops checking once the file has been read", async () => {
    const server = startServer(["processing", "completed"]);
    await sendFile("lease.pdf");
    await screen.findByText("Got it! Check your Transactions page for the extracted data.");
    const checksWhenRead = server.statusChecks.length;
    await pause(POLL_MS * 8);
    expect(server.statusChecks).toHaveLength(checksWhenRead);
  });

  it("stops checking while the app is in the background, and checks again when it returns", async () => {
    const server = startServer(["processing"]);
    await sendFile("lease.pdf");
    await waitFor(() => expect(server.statusChecks.length).toBeGreaterThanOrEqual(2));

    await act(async () => {
      store.dispatch(baseApi.internalActions.onFocusLost());
    });
    await pause(POLL_MS * 2);
    const whileHidden = server.statusChecks.length;
    await pause(POLL_MS * 8);
    expect(server.statusChecks).toHaveLength(whileHidden);

    await act(async () => {
      store.dispatch(baseApi.internalActions.onFocus());
    });
    await waitFor(() => expect(server.statusChecks.length).toBeGreaterThan(whileHidden));
  });
});
