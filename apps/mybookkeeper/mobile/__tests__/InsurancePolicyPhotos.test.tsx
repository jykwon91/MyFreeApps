import "@platform/mobile/test-support/reactNativeFormData";
import api from "@platform/core/lib/api";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import * as ImagePicker from "expo-image-picker";
import { removeHeldFileLabel } from "../src/constants/uploads";
import PolicyDetailScreen from "../src/features/insurance/PolicyDetailScreen";
import { preparePhoto } from "../src/features/capture/preparePhoto";
import { formParts, formValue } from "../test-support/applicantsServer";
import { File, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { startInsuranceServer } from "../test-support/insuranceServer";
import { renderInsurance, resetInsuranceStore } from "../test-support/renderInsurance";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { back: jest.fn(), push: jest.fn() } }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn(), launchCameraAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock("../src/features/capture/preparePhoto", () => ({ preparePhoto: jest.fn(async (uri: string) => uri) }));
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;
let counter = 0;

beforeEach(() => {
  resetInsuranceStore();
  resetFakeFiles();
  jest.clearAllMocks();
  jest.mocked(preparePhoto).mockReset().mockImplementation(async (uri: string) => uri);
  counter = 0;
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

function libraryResult(count: number): ImagePicker.ImagePickerResult {
  const assets = Array.from({ length: count }, () => {
    counter += 1;
    const uri = `cache:/pick${counter}.jpg`;
    new File(uri).create();
    return { uri, width: 800, height: 600 };
  });
  return { canceled: false, assets } as ImagePicker.ImagePickerResult;
}

async function pickPhotos(count: number) {
  await fireEvent.press(await screen.findByRole("button", { name: "Add a document" }));
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(libraryResult(count));
  await fireEvent.press(screen.getByRole("button", { name: "Photo library" }));
  await screen.findByText(`policy-${count}.jpg`);
}

/** Answers 413 for one photo by name and lets the rest through to the fake server. */
function rejectPhoto(name: string) {
  const inner = api.defaults.adapter as AxiosAdapter;
  api.defaults.adapter = (config) => {
    const isRejected = config.method === "post" && String(config.url).endsWith("/attachments") && formParts(config.data).some((part) => part.name === name);
    if (!isRejected) return inner(config);
    return Promise.reject({ isAxiosError: true, response: { status: 413, data: {}, headers: {}, statusText: "", config }, config, message: "too large" });
  };
}

describe("adding several photos to a policy", () => {
  it("asks the library for several at once and uploads each of them as the chosen kind", async () => {
    const server = startInsuranceServer();
    await renderInsurance(<PolicyDetailScreen id="p1" />);
    await pickPhotos(3);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsMultipleSelection: true, selectionLimit: 0 }));
    await fireEvent.press(screen.getByRole("radio", { name: "Binder" }));
    await fireEvent.press(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText("3 documents added.")).toBeTruthy();
    const posts = server.requests.filter((request) => request.method === "post");
    expect(posts.map((post) => formParts(post.data).find((part) => part.fieldName === "file")?.name)).toEqual(["policy-1.jpg", "policy-2.jpg", "policy-3.jpg"]);
    expect(posts.every((post) => formValue(post.data, "kind") === "binder")).toBe(true);
    expect(screen.queryByRole("button", { name: "Upload" })).toBeNull();
  });

  it("names the photo that failed, keeps it for another try and still uploads the rest", async () => {
    const server = startInsuranceServer();
    await renderInsurance(<PolicyDetailScreen id="p1" />);
    await pickPhotos(3);
    rejectPhoto("policy-2.jpg");
    await fireEvent.press(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText("policy-2.jpg: That file's too big. I can take up to 10MB.")).toBeTruthy();
    expect(await screen.findByText("2 documents added.")).toBeTruthy();
    await waitFor(() => expect(server.policies[0].attachments).toHaveLength(3));
    expect(screen.getByText("policy-2.jpg")).toBeTruthy();
    expect(screen.queryByText("policy-1.jpg")).toBeNull();
    expect(screen.queryByText("policy-3.jpg")).toBeNull();
  });

  it("lets a photo be taken out before uploading", async () => {
    const server = startInsuranceServer();
    await renderInsurance(<PolicyDetailScreen id="p1" />);
    await pickPhotos(2);
    await fireEvent.press(screen.getByRole("button", { name: removeHeldFileLabel("policy-1.jpg") }));
    await fireEvent.press(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText("Document added.")).toBeTruthy();
    expect(server.requests.filter((request) => request.method === "post")).toHaveLength(1);
  });
});
