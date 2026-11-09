import "../test-support/reactNativeFormData";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Linking } from "react-native";
import { Provider } from "react-redux";
import CaptureScreen from "../src/features/capture/CaptureScreen";
import { uploadStatusDismissed } from "../src/features/capture/uploadsSlice";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { fakeFiles, resetFakeFiles } from "../test-support/fakeFileSystem";

const mockDismissTo = jest.fn();
const mockTakePicture = jest.fn();
const mockPickPhotos = jest.fn();
const mockPickDocuments = jest.fn();
const mockResize = jest.fn();
let mockPermission: { granted: boolean; canAskAgain: boolean } | null;
const mockRequestPermission = jest.fn();

jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));
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
jest.mock("expo-document-picker", () => ({ getDocumentAsync: () => mockPickDocuments() }));
jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => ({
      resize: (size: object) => mockResize(size),
      release: jest.fn(),
      renderAsync: async () => ({ saveAsync: async () => ({ uri: "doc:/prepared.jpg" }), release: jest.fn() }),
    }),
  },
}));

const originalAdapter = api.defaults.adapter;
const TAKEN = { uri: "doc:/taken.jpg", width: 4000, height: 3000 };

function acceptUploads(): { names: string[] } {
  const record = { names: [] as string[] };
  const adapter: AxiosAdapter = (config) => {
    const parts = (config.data as unknown as { getParts: () => { name: string }[] }).getParts();
    record.names.push(parts[0].name);
    return Promise.resolve({ data: { document_id: "d", batch_id: null, batch_total: 1 }, status: 202, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
  return record;
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
    expect(mockResize).toHaveBeenCalledWith({ width: 2000 });
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

  it("leaves a small photo at its size", async () => {
    mockPickPhotos.mockResolvedValue({ canceled: false, assets: [{ uri: "doc:/small.jpg", width: 800, height: 600 }] });
    const server = acceptUploads();
    await renderScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Library" }));
    await waitFor(() => expect(server.names).toHaveLength(1));
    expect(mockResize).not.toHaveBeenCalled();
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
});
