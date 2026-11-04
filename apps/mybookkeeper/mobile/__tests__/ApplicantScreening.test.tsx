import "../test-support/reactNativeFormData";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import type { AxiosAdapter } from "axios";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Alert, Linking } from "react-native";
import { Provider } from "react-redux";
import { SCREENING_UPLOAD_TIMEOUT_MS } from "@mybookkeeper/api-client/constants/screeningStatus";
import type { ScreeningResult } from "@mybookkeeper/api-client/types/applicant/screening-result";
import ApplicantDetailScreen from "../src/features/applicants/ApplicantDetailScreen";
import { clearHeldFiles } from "../src/features/uploads/heldFile";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { anApplicant, formParts, formValue, SAMPLE_PROVIDER, startApplicantServer } from "../test-support/applicantsServer";
import type { FakeApplicantServer } from "../test-support/applicantsServer";
import { Directory, fakeFiles, File, Paths, resetFakeFiles } from "../test-support/fakeFileSystem";

const mockRender = jest.fn();
function photoRendersFine(): void {
  mockRender.mockImplementation(async () => ({
    saveAsync: async () => {
      const prepared = new File("cache:/prepared.jpg");
      prepared.write("jpeg");
      return { uri: prepared.uri };
    },
  }));
}

jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));
jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));
jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => ({
      resize: jest.fn(),
      renderAsync: async () => mockRender(),
    }),
  },
}));
jest.mock("expo-local-authentication", () => ({ SecurityLevel: { NONE: 0 }, authenticateAsync: jest.fn(), getEnrolledLevelAsync: jest.fn() }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;
const CHOOSE = { name: "Choose a file" };
const SAVE = { name: "Save result" };

const PASSED: ScreeningResult = {
  id: "s1", applicant_id: "a1", provider: "keycheck", status: "pass", has_report: true, notes: null,
  requested_at: "2026-11-01T12:00:00Z", completed_at: "2026-11-02T12:00:00Z", uploaded_at: "2026-11-02T12:00:00Z",
  uploaded_by_user_id: "u1", created_at: "2026-11-02T12:00:00Z",
};

function pickedPdf(name = "report.pdf") {
  const source = new File(`cache:/DocumentPicker/${name}`);
  source.write("pdf");
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: source.uri, name, mimeType: "application/pdf" }],
  } as DocumentPicker.DocumentPickerResult);
}

async function renderScreen() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <ApplicantDetailScreen id="a1" />
      </ToastProvider>
    </Provider>,
  );
}

async function openSheet(label = "Upload a result") {
  await fireEvent.press(await screen.findByRole("button", { name: label }));
  await screen.findByText("Upload a screening result");
}

async function chooseFile() {
  pickedPdf();
  await fireEvent.press(screen.getByRole("button", CHOOSE));
  await screen.findByText("report.pdf");
}

function uploads(server: FakeApplicantServer) {
  return server.requests.filter((request) => request.url?.endsWith("/upload-result"));
}

function heldFiles(): string[] {
  return fakeFiles().filter((uri) => uri.includes("held-uploads"));
}

describe("screening on the applicant page", () => {
  beforeEach(() => {
    session.tokenStore.set("token");
    store.dispatch(baseApi.util.resetApiState());
    store.dispatch(workspaceChosen("w1"));
    jest.clearAllMocks();
    resetFakeFiles();
    photoRendersFine();
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    jest.restoreAllMocks();
  });

  describe("starting a check", () => {
    it("opens the provider in the phone's browser and says what's next", async () => {
      startApplicantServer([anApplicant()]);
      const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
      await renderScreen();
      await fireEvent.press(await screen.findByRole("button", { name: "Open KeyCheck" }));
      expect(openURL).toHaveBeenCalledWith(SAMPLE_PROVIDER.external_url);
      expect(await screen.findByText("I opened KeyCheck. When the report is ready, upload it here.")).toBeTruthy();
    });

    it("says when it can't get the link", async () => {
      const server = startApplicantServer([anApplicant()]);
      server.redirectFailure = 500;
      const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
      await renderScreen();
      await fireEvent.press(await screen.findByRole("button", { name: "Open KeyCheck" }));
      expect(await screen.findByText("I couldn't open KeyCheck. Want me to try again?")).toBeTruthy();
      expect(openURL).not.toHaveBeenCalled();
    });

    it("says when the phone can't open it", async () => {
      startApplicantServer([anApplicant()]);
      jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no"));
      await renderScreen();
      await fireEvent.press(await screen.findByRole("button", { name: "Open KeyCheck" }));
      expect(await screen.findByText("I couldn't open KeyCheck. Want me to try again?")).toBeTruthy();
      expect(screen.queryByText(/I opened KeyCheck/)).toBeNull();
    });

    it("folds providers away once there's a result", async () => {
      startApplicantServer([anApplicant({ screening_results: [PASSED] })]);
      await renderScreen();
      expect(await screen.findByText("KeyCheck: Passed")).toBeTruthy();
      expect(await screen.findByRole("button", { name: "Upload another result" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Open KeyCheck" })).toBeNull();
      await fireEvent.press(screen.getByRole("button", { name: /Run another check/ }));
      expect(await screen.findByRole("button", { name: "Open KeyCheck" })).toBeTruthy();
    });
  });

  describe("what the section shows", () => {
    it("lists what's missing and offers nothing else", async () => {
      const server = startApplicantServer([anApplicant()]);
      server.eligibility = { eligible: false, missing_fields: ["Contact method"], has_pending: false };
      await renderScreen();
      expect(await screen.findByText("I need a few more details before screening.")).toBeTruthy();
      expect(screen.getByText("Contact method")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Upload a result" })).toBeNull();
    });

    it("waits on a pending report, with upload but no providers", async () => {
      const server = startApplicantServer([anApplicant()]);
      server.eligibility = { eligible: true, missing_fields: [], has_pending: true };
      await renderScreen();
      expect(await screen.findByText("Waiting on a report. Have it? Upload it.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Upload a result" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Open KeyCheck" })).toBeNull();
    });

    it("explains offline, and tries again", async () => {
      const server = startApplicantServer([anApplicant()]);
      await renderScreen();
      await screen.findByText("Dana Reed");
      await act(async () => {
        server.offline = true;
        store.dispatch(baseApi.util.resetApiState());
      });
      expect(await screen.findByText(/connection|couldn't load/i)).toBeTruthy();
    });

    it("says when it can't check, and tries again", async () => {
      const server = startApplicantServer([anApplicant()]);
      server.eligibilityFailure = 500;
      await renderScreen();
      expect(await screen.findByText("I couldn't check if screening is ready.")).toBeTruthy();
      server.eligibilityFailure = null;
      await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByRole("button", { name: "Open KeyCheck" })).toBeTruthy();
    });

    it("shows a viewer results only, and asks the server nothing", async () => {
      const server = startApplicantServer([anApplicant({ screening_results: [PASSED] })]);
      server.role = "viewer";
      await renderScreen();
      expect(await screen.findByText("KeyCheck: Passed")).toBeTruthy();
      await screen.findByText("You have view-only access.");
      expect(screen.queryByRole("button", { name: /Upload/ })).toBeNull();
      expect(server.requests.some((request) => request.url?.includes("/screening/"))).toBe(false);
    });
  });

  describe("uploading", () => {
    it("sends the file and outcome, shows the new result and deletes the phone's copy", async () => {
      const server = startApplicantServer([anApplicant()]);
      await renderScreen();
      await openSheet();
      await chooseFile();
      expect(heldFiles()).toHaveLength(1);
      await fireEvent.press(screen.getByRole("radio", { name: "Passed" }));
      await fireEvent.press(screen.getByRole("button", SAVE));
      expect(await screen.findByText("Saved the screening result.")).toBeTruthy();
      const form = uploads(server)[0].data;
      expect(formValue(form, "status")).toBe("pass");
      expect(formValue(form, "adverse_action_snippet")).toBeUndefined();
      expect(formParts(form).find((part) => part.fieldName === "file")).toEqual(expect.objectContaining({ name: "report.pdf", type: "application/pdf" }));
      expect(await screen.findByText("KeyCheck: Passed")).toBeTruthy();
      expect(heldFiles()).toHaveLength(0);
      expect(uploads(server)[0].timeout).toBe(SCREENING_UPLOAD_TIMEOUT_MS);
    });

    it.each(["Didn't pass", "Inconclusive"])("needs a reason for %s, and sends it", async (label) => {
      const server = startApplicantServer([anApplicant()]);
      await renderScreen();
      await openSheet();
      await chooseFile();
      await fireEvent.press(screen.getByRole("radio", { name: label }));
      await fireEvent.press(screen.getByRole("button", SAVE));
      expect(uploads(server)).toHaveLength(0);
      await fireEvent.changeText(screen.getByLabelText("Reason"), "  Income too low  ");
      await fireEvent.press(screen.getByRole("button", SAVE));
      await screen.findByText("Saved the screening result.");
      expect(formValue(uploads(server)[0].data, "adverse_action_snippet")).toBe("Income too low");
    });

    it("doesn't send without a file or an outcome", async () => {
      const server = startApplicantServer([anApplicant()]);
      await renderScreen();
      await openSheet();
      await fireEvent.press(screen.getByRole("radio", { name: "Passed" }));
      await fireEvent.press(screen.getByRole("button", SAVE));
      expect(uploads(server)).toHaveLength(0);
    });

    it("doesn't offer pending as an outcome", async () => {
      startApplicantServer([anApplicant()]);
      await renderScreen();
      await openSheet();
      expect(screen.getAllByRole("radio")).toHaveLength(3);
      expect(screen.queryByRole("radio", { name: /Waiting|Pending/ })).toBeNull();
    });

    it.each([
      [413, "That file is too big. Try a smaller PDF or a lower-resolution photo."],
      [415, "I can't read that kind of file. Use a PDF, JPEG, or PNG."],
      [422, "I need a reason for that outcome."],
      [503, "I couldn't save the file just now. Your report is still here, so try again in a bit."],
      [500, "I couldn't upload that. Want me to try again?"],
    ])("explains a %i, keeps what they entered and can retry", async (status, message) => {
      const server = startApplicantServer([anApplicant()]);
      server.uploadFailure = status;
      await renderScreen();
      await openSheet();
      await chooseFile();
      await fireEvent.press(screen.getByRole("radio", { name: "Passed" }));
      await fireEvent.press(screen.getByRole("button", SAVE));
      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.getByText("report.pdf")).toBeTruthy();
      expect(heldFiles()).toHaveLength(1);
      server.uploadFailure = null;
      await fireEvent.press(screen.getByRole("button", SAVE));
      expect(await screen.findByText("Saved the screening result.")).toBeTruthy();
      expect(heldFiles()).toHaveLength(0);
    });

    it("explains no connection and keeps the file", async () => {
      const server = startApplicantServer([anApplicant()]);
      await renderScreen();
      await openSheet();
      await chooseFile();
      await fireEvent.press(screen.getByRole("radio", { name: "Passed" }));
      server.offline = true;
      await fireEvent.press(screen.getByRole("button", SAVE));
      expect(await screen.findByText("I couldn't upload that. Want me to try again?")).toBeTruthy();
      expect(heldFiles()).toHaveLength(1);
    });
  });

  describe("choosing the report", () => {
    it("takes a photo, without keeping the camera's copy, and sends it as a JPEG", async () => {
      const server = startApplicantServer([anApplicant()]);
      const shot = new File("cache:/ImagePicker/shot.heic");
      shot.write("heic");
      jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: true } as ImagePicker.CameraPermissionResponse);
      jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue({
        canceled: false,
        assets: [{ uri: shot.uri, width: 100, height: 100 }],
      } as ImagePicker.ImagePickerResult);
      await renderScreen();
      await openSheet();
      await fireEvent.press(screen.getByRole("button", { name: "Take a photo of a paper report" }));
      await screen.findByText("screening-report.jpg");
      expect(shot.exists).toBe(false);
      expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ exif: false }));
      await fireEvent.press(screen.getByRole("radio", { name: "Passed" }));
      await fireEvent.press(screen.getByRole("button", SAVE));
      await screen.findByText("Saved the screening result.");
      expect(formParts(uploads(server)[0].data).find((part) => part.fieldName === "file")).toEqual(expect.objectContaining({ type: "image/jpeg" }));
    });

    it("says when the camera isn't allowed", async () => {
      startApplicantServer([anApplicant()]);
      jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: false } as ImagePicker.CameraPermissionResponse);
      await renderScreen();
      await openSheet();
      await fireEvent.press(screen.getByRole("button", { name: "Take a photo of a paper report" }));
      expect(await screen.findByText("I need camera access for that. You can turn it on in Settings.")).toBeTruthy();
      expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    });

    it("chooses from the photo library", async () => {
      startApplicantServer([anApplicant()]);
      const photo = new File("cache:/ImagePicker/photo.jpg");
      photo.write("jpg");
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
        canceled: false,
        assets: [{ uri: photo.uri, width: 100, height: 100 }],
      } as ImagePicker.ImagePickerResult);
      await renderScreen();
      await openSheet();
      await fireEvent.press(screen.getByRole("button", { name: "Photo library" }));
      expect(await screen.findByText("screening-report.jpg")).toBeTruthy();
    });

    it("stays as it was when they cancel the picker", async () => {
      startApplicantServer([anApplicant()]);
      jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({ canceled: true, assets: null });
      await renderScreen();
      await openSheet();
      await fireEvent.press(screen.getByRole("button", CHOOSE));
      expect(await screen.findByRole("button", CHOOSE)).toBeTruthy();
      expect(heldFiles()).toHaveLength(0);
    });

    it("says when picking breaks", async () => {
      startApplicantServer([anApplicant()]);
      jest.mocked(DocumentPicker.getDocumentAsync).mockRejectedValue(new Error("no"));
      await renderScreen();
      await openSheet();
      await fireEvent.press(screen.getByRole("button", CHOOSE));
      expect(await screen.findByText("I couldn't get that file. Want me to try again?")).toBeTruthy();
    });

    it("doesn't leave the picker's copy behind when a photo can't be prepared", async () => {
      startApplicantServer([anApplicant()]);
      const photo = new File("cache:/ImagePicker/photo.jpg");
      photo.write("jpg");
      mockRender.mockRejectedValue(new Error("unreadable"));
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
        canceled: false,
        assets: [{ uri: photo.uri, width: 100, height: 100 }],
      } as ImagePicker.ImagePickerResult);
      await renderScreen();
      await openSheet();
      await fireEvent.press(screen.getByRole("button", { name: "Photo library" }));
      expect(await screen.findByText("I couldn't get that file. Want me to try again?")).toBeTruthy();
      expect(photo.exists).toBe(false);
    });

    it("keeps only the latest file when they replace it", async () => {
      startApplicantServer([anApplicant()]);
      await renderScreen();
      await openSheet();
      await chooseFile();
      pickedPdf("second.pdf");
      await fireEvent.press(screen.getByRole("button", { name: "Choose a different file" }));
      await screen.findByText("second.pdf");
      expect(heldFiles()).toHaveLength(1);
    });
  });

  describe("closing", () => {
    it("closes straight away with nothing entered", async () => {
      startApplicantServer([anApplicant()]);
      const alert = jest.spyOn(Alert, "alert");
      await renderScreen();
      await openSheet();
      await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
      expect(alert).not.toHaveBeenCalled();
      expect(screen.queryByText("Upload a screening result")).toBeNull();
    });

    it("asks first, and discarding deletes the phone's copy", async () => {
      startApplicantServer([anApplicant()]);
      const alert = jest.spyOn(Alert, "alert");
      await renderScreen();
      await openSheet();
      await chooseFile();
      await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
      expect(alert.mock.calls[0][0]).toBe("Discard this upload?");
      expect(screen.getByText("report.pdf")).toBeTruthy();
      await act(async () => {
        alert.mock.calls[0][2]?.find((button) => button.text === "Discard")?.onPress?.();
      });
      expect(screen.queryByText("Upload a screening result")).toBeNull();
      expect(heldFiles()).toHaveLength(0);
    });

    it("can't be closed while choosing a file, so the file can't land in a hidden sheet", async () => {
      startApplicantServer([anApplicant()]);
      const source = new File("cache:/DocumentPicker/report.pdf");
      source.write("pdf");
      let finishPick: (result: DocumentPicker.DocumentPickerResult) => void = () => undefined;
      jest.mocked(DocumentPicker.getDocumentAsync).mockReturnValue(new Promise((resolve) => { finishPick = resolve; }));
      await renderScreen();
      await openSheet();
      await fireEvent.press(screen.getByRole("button", CHOOSE));
      await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.getByText("Upload a screening result")).toBeTruthy();
      await act(async () => {
        finishPick({ canceled: false, assets: [{ uri: source.uri, name: "report.pdf", mimeType: "application/pdf" }] } as DocumentPicker.DocumentPickerResult);
      });
      expect(await screen.findByText("report.pdf")).toBeTruthy();
    });

    it("deletes a held report when the page goes away", async () => {
      startApplicantServer([anApplicant()]);
      await renderScreen();
      await openSheet();
      await chooseFile();
      expect(heldFiles()).toHaveLength(1);
      await screen.unmount();
      expect(heldFiles()).toHaveLength(0);
    });

    it("deletes a report that arrives after the page went away", async () => {
      startApplicantServer([anApplicant()]);
      const source = new File("cache:/DocumentPicker/report.pdf");
      source.write("pdf");
      let finishPick: (result: DocumentPicker.DocumentPickerResult) => void = () => undefined;
      jest.mocked(DocumentPicker.getDocumentAsync).mockReturnValue(new Promise((resolve) => { finishPick = resolve; }));
      await renderScreen();
      await openSheet();
      await fireEvent.press(screen.getByRole("button", CHOOSE));
      await screen.unmount();
      await act(async () => {
        finishPick({ canceled: false, assets: [{ uri: source.uri, name: "report.pdf", mimeType: "application/pdf" }] } as DocumentPicker.DocumentPickerResult);
      });
      expect(heldFiles()).toHaveLength(0);
    });

    it("can't be closed mid upload", async () => {
      const server = startApplicantServer([anApplicant()]);
      const answer = api.defaults.adapter as AxiosAdapter;
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => { release = resolve; });
      api.defaults.adapter = async (config) => {
        if (config.url?.endsWith("/upload-result")) await held;
        return answer(config);
      };
      await renderScreen();
      await openSheet();
      await chooseFile();
      await fireEvent.press(screen.getByRole("radio", { name: "Passed" }));
      await fireEvent.press(screen.getByRole("button", SAVE));
      await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.getByText("Upload a screening result")).toBeTruthy();
      await act(async () => { release(); });
      await screen.findByText("Saved the screening result.");
      expect(uploads(server)).toHaveLength(1);
    });
  });

  it("clears anything left over", () => {
    const directory = new Directory(Paths.cache, "held-uploads");
    directory.create();
    new File(directory, "left.pdf").write("pdf");
    clearHeldFiles();
    expect(heldFiles()).toHaveLength(0);
  });
});
