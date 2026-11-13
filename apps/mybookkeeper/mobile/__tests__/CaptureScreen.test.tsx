import "@platform/mobile/test-support/reactNativeFormData";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Linking } from "react-native";
import { Provider } from "react-redux";
import CaptureScreen from "../src/features/capture/CaptureScreen";
import { uploadStatusDismissed } from "../src/features/capture/uploadsSlice";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { DOCUMENT_UPLOAD_MAX_BYTES } from "@mybookkeeper/api-client/constants/documentUpload";

const mockDismissTo = jest.fn();
const mockTakePicture = jest.fn();
const mockPickPhotos = jest.fn();
const mockPickDocuments = jest.fn();
const mockManipulate = jest.fn();
let mockPermission: { granted: boolean; canAskAgain: boolean } | null;
const mockRequestPermission = jest.fn();

jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("../src/features/aiPermission/aiPermission", () => ({
  ...jest.requireActual("../src/features/aiPermission/aiPermission"),
  hasAiPermission: () => true,
}));
jest.mock("expo-router", () => ({ router: { dismissTo: (path: string) => mockDismissTo(path) } }));
jest.mock("expo-camera", () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    CameraView: forwardRef(function CameraView(props: object, ref: unknown) {
      useImperativeHandle(ref, () => ({ takePictureAsync: mockTakePicture }));
      return <View {...props} />;
    }),
    useCameraPermissions: () => [mockPermission, mockRequestPermission],
  };
});
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: () => mockPickPhotos() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: (options: object) => mockPickDocuments(options) }));
jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: (uri: string, options: object) => {
      mockManipulate(uri, options);
      return {
        release: jest.fn(),
        renderAsync: async () => ({ saveAsync: async () => ({ uri: "doc:/prepared.jpg" }), release: jest.fn() }),
      };
    },
  },
}));

const originalAdapter = api.defaults.adapter;
const TAKEN = { uri: "doc:/taken.jpg" };

function acceptUploads(): { names: string[]; types: string[] } {
  const record = { names: [] as string[], types: [] as string[] };
  const adapter: AxiosAdapter = (config) => {
    const parts = (config.data as unknown as { getParts: () => { name: string; type: string }[] }).getParts();
    record.names.push(parts[0].name);
    record.types.push(parts[0].type);
    return Promise.resolve({ data: { document_id: "d", batch_id: null, batch_total: 1 }, status: 202, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
  return record;
}

/** Puts the picker's copy of each file on the fake disk and has the picker hand them back. */
function pickerReturns(...assets: { uri: string; name: string; mimeType?: string; size?: number }[]): void {
  resetFakeFiles([...fakeFiles(), ...assets.map((asset) => asset.uri)]);
  mockPickDocuments.mockResolvedValue({ canceled: false, assets });
}

async function renderScreen() {
  await render(
    <Provider store={store}>
      <CaptureScreen />
    </Provider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  resetFakeFiles(["doc:/prepared.jpg", "doc:/invoice.pdf", TAKEN.uri, "doc:/small.jpg"]);
  mockPermission = { granted: true, canAskAgain: true };
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  store.dispatch(uploadStatusDismissed());
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("CaptureScreen", () => {
  it("takes a photo, checks it with you, sends it, and stays open for the next", async () => {
    mockTakePicture.mockResolvedValue(TAKEN);
    const server = acceptUploads();
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Take photo" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Use photo" }));
    expect(await screen.findByRole("button", { name: "Take photo" })).toBeTruthy();
    await waitFor(() => expect(server.names).toHaveLength(1));
    expect(server.names[0]).toMatch(/^receipt-.*\.jpg$/);
    expect(mockManipulate).toHaveBeenCalledWith(TAKEN.uri, { maxWidth: 2000, maxHeight: 2000 });
    expect(await screen.findByRole("button", { name: "Done (1)" })).toBeTruthy();
    expect(await screen.findByText("Got it. I'm reading it now.")).toBeTruthy();
    expect(fakeFiles()).not.toContain(TAKEN.uri);
  });

  it("sends nothing when you retake", async () => {
    mockTakePicture.mockResolvedValue(TAKEN);
    const server = acceptUploads();
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Take photo" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Retake" }));
    expect(await screen.findByRole("button", { name: "Take photo" })).toBeTruthy();
    expect(server.names).toEqual([]);
    expect(fakeFiles()).not.toContain(TAKEN.uri);
  });

  it("re-encodes a library photo at the same size limit", async () => {
    mockPickPhotos.mockResolvedValue({ canceled: false, assets: [{ uri: "doc:/small.jpg" }] });
    const server = acceptUploads();
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Library" }));
    await waitFor(() => expect(server.names).toHaveLength(1));
    expect(mockManipulate).toHaveBeenCalledWith("doc:/small.jpg", { maxWidth: 2000, maxHeight: 2000 });
  });

  it("does nothing when you cancel the library", async () => {
    mockPickPhotos.mockResolvedValue({ canceled: true, assets: null });
    const server = acceptUploads();
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Library" }));
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    expect(server.names).toEqual([]);
  });

  it("sends a PDF as a PDF, whatever it was named", async () => {
    mockPickDocuments.mockResolvedValue({ canceled: false, assets: [{ uri: "doc:/invoice.pdf", name: "invoice" }] });
    const server = acceptUploads();
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Files" }));
    await waitFor(() => expect(server.names).toEqual(["invoice.pdf"]));
  });

  it("asks for the camera, and still offers the library without it", async () => {
    mockPermission = { granted: false, canAskAgain: true };
    await renderScreen();
    expect(screen.getByText("I need camera access to read your receipts.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Library" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Allow camera" }));
    expect(mockRequestPermission).toHaveBeenCalled();
  });

  it("points to Settings once the system won't ask again", async () => {
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue();
    mockPermission = { granted: false, canAskAgain: false };
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Open Settings" }));
    expect(openSettings).toHaveBeenCalled();
    openSettings.mockRestore();
  });

  it("says so when a photo can't be taken", async () => {
    mockTakePicture.mockRejectedValue(new Error("busy"));
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Take photo" }));
    expect(await screen.findByText("I couldn't take that photo. Want to try again?")).toBeTruthy();
  });

  it("goes to your documents when you're done", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(mockDismissTo).toHaveBeenCalledWith("/money");
  });

  it("offers every type the server reads in the Files picker", async () => {
    mockPickDocuments.mockResolvedValue({ canceled: true, assets: null });
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Files" }));
    const { type } = mockPickDocuments.mock.calls[0][0] as { type: string[] };
    expect(type).toEqual(
      expect.arrayContaining([
        "application/pdf",
        "image/jpeg",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
        "application/zip",
      ]),
    );
    expect(screen.getByText(/Word, Excel, CSV and zip files\. Up to 10 at a time, 29 MB each\./)).toBeTruthy();
  });

  it.each([
    ["lease.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["old.doc", "application/msword"],
    ["ledger.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["old.xls", "application/vnd.ms-excel"],
    ["bank.csv", "text/csv"],
    ["receipts.zip", "application/zip"],
    ["scan.png", "image/png"],
  ])("sends %s from Files as it is", async (name, type) => {
    pickerReturns({ uri: `cache:/${name}`, name, size: 2048 });
    const server = acceptUploads();
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Files" }));
    await waitFor(() => expect(server.names).toEqual([name]));
    expect(server.types).toEqual([type]);
    expect(mockManipulate).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Done (1)" })).toBeTruthy();
  });

  it("names a picked file by its reported type when the name has no extension", async () => {
    pickerReturns({ uri: "cache:/upload-123", name: "March statement", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const server = acceptUploads();
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Files" }));
    await waitFor(() => expect(server.names).toEqual(["March statement.xlsx"]));
  });

  it("turns away a type it can't read, says why, and sends nothing", async () => {
    pickerReturns({ uri: "cache:/notes.txt", name: "notes.txt", mimeType: "application/octet-stream", size: 100 });
    const server = acceptUploads();
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Files" }));
    expect(
      await screen.findByText("I can't read notes.txt. I take PDFs, photos (JPG, PNG, WEBP), Word, Excel, CSV and zip files."),
    ).toBeTruthy();
    expect(server.names).toEqual([]);
    expect(fakeFiles()).not.toContain("cache:/notes.txt");
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("turns away a file too big to get through, says how big it may be, and sends the rest", async () => {
    pickerReturns(
      { uri: "cache:/scans.zip", name: "scans.zip", size: DOCUMENT_UPLOAD_MAX_BYTES + 1 },
      { uri: "cache:/bank.csv", name: "bank.csv", size: 500 },
    );
    const server = acceptUploads();
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Files" }));
    expect(await screen.findByText("scans.zip is over 29 MB, which is more than I can take. Try a smaller file, or split it up.")).toBeTruthy();
    await waitFor(() => expect(server.names).toEqual(["bank.csv"]));
    expect(fakeFiles()).not.toContain("cache:/scans.zip");
    expect(await screen.findByRole("button", { name: "Done (1)" })).toBeTruthy();
  });

  it("shows each file go from waiting to sending to sent", async () => {
    pickerReturns({ uri: "cache:/lease.docx", name: "lease.docx", size: 100 }, { uri: "cache:/bank.csv", name: "bank.csv", size: 100 });
    const releases: (() => void)[] = [];
    const sent: string[] = [];
    const adapter: AxiosAdapter = (config) => {
      sent.push((config.data as unknown as { getParts: () => { name: string }[] }).getParts()[0].name);
      config.onUploadProgress?.({ loaded: 25, total: 100, bytes: 25, lengthComputable: true });
      return new Promise((resolve) => {
        releases.push(() => resolve({ data: { document_id: "d" }, status: 202, statusText: "", headers: {}, config }));
      });
    };
    api.defaults.adapter = adapter;
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Files" }));

    // Picked together, they can be queued in either order; follow whichever the server gets first.
    await waitFor(() => expect(sent).toHaveLength(1));
    const [first, second] = sent[0] === "lease.docx" ? ["lease.docx", "bank.csv"] : ["bank.csv", "lease.docx"];
    expect(await screen.findByLabelText(`${first}, Sending… 25%`)).toBeTruthy();
    expect(screen.getByLabelText(`${second}, Waiting to send`)).toBeTruthy();

    await act(async () => releases[0]());
    expect(await screen.findByLabelText(`${first}, Sent`)).toBeTruthy();
    expect(await screen.findByLabelText(`${second}, Sending… 25%`)).toBeTruthy();

    await act(async () => releases[1]());
    expect(await screen.findByLabelText(`${second}, Sent`)).toBeTruthy();
    expect(sent).toEqual([first, second]);
    expect(await screen.findByText("Got it. I'm reading it now.")).toBeTruthy();
  });

  it("shows a file the server refused as failed, with its reason", async () => {
    pickerReturns({ uri: "cache:/receipts.zip", name: "receipts.zip", size: 100 });
    const adapter: AxiosAdapter = (config) => {
      const response = { data: { detail: "No supported files found in zip" }, status: 422, statusText: "", headers: {}, config };
      return Promise.reject(Object.assign(new Error("422"), { config, response, isAxiosError: true }));
    };
    api.defaults.adapter = adapter;
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Files" }));
    expect(await screen.findByLabelText("receipts.zip, Couldn't send")).toBeTruthy();
    expect(screen.getByText("I couldn't send receipts.zip. No supported files found in zip")).toBeTruthy();
  });
});
