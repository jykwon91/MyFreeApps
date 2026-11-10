import "@platform/mobile/test-support/reactNativeFormData";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { formParts } from "../test-support/applicantsServer";
import { anAttachment, startCalendarServer } from "../test-support/calendarServer";
import { aBookingThisMonth, openBooking } from "../test-support/calendarSheet";
import { fakeDownloads, File, resetFakeFiles } from "../test-support/fakeFileSystem";
import { holdWrites } from "../test-support/holdWrites";

jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));
jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn() } }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));
jest.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: jest.fn() } }));
jest.mock("expo-local-authentication", () => ({ SecurityLevel: { NONE: 0 }, authenticateAsync: jest.fn(), getEnrolledLevelAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;

function pick(name: string, mimeType: string) {
  const source = new File(`cache:/DocumentPicker/${name}`);
  source.write("data");
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: source.uri, name, mimeType }],
  } as DocumentPicker.DocumentPickerResult);
}

async function chooseFile(name = "receipt.pdf", mimeType = "application/pdf") {
  pick(name, mimeType);
  await fireEvent.press(screen.getByRole("button", { name: "Choose a file" }));
  await screen.findByText(name);
}

function alertButton(label: string) {
  return jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]?.find((button) => button.text === label);
}

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
  resetFakeFiles();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("a booking's attachments", () => {
  it("lists the files with their sizes", async () => {
    startCalendarServer({ events: [aBookingThisMonth()], attachments: { e1: [anAttachment()] } });
    await openBooking();
    expect(await screen.findByText("confirmation.pdf")).toBeTruthy();
    expect(screen.getByText("2.0 KB")).toBeTruthy();
  });

  it("shows a skeleton while loading, then says when there are none", async () => {
    startCalendarServer({ events: [aBookingThisMonth()] });
    await openBooking();
    expect(await screen.findByText("No attachments yet.")).toBeTruthy();
  });

  it("offers a retry when the list won't load, and recovers", async () => {
    const server = startCalendarServer({ events: [aBookingThisMonth()], attachmentsFailure: 500, attachments: { e1: [anAttachment()] } });
    await openBooking();
    expect(await screen.findByText("I couldn't load the attachments.")).toBeTruthy();
    server.attachmentsFailure = null;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("confirmation.pdf")).toBeTruthy();
  });

  it("opens a file on a fresh link, not the one the list was loaded with", async () => {
    const server = startCalendarServer({ events: [aBookingThisMonth()], attachments: { e1: [anAttachment()] } });
    await openBooking();
    const open = await screen.findByRole("button", { name: "Open confirmation.pdf" });
    server.attachments.e1 = [anAttachment({ presigned_url: "https://files.example/fresh" })];
    await fireEvent.press(open);
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.stringContaining("f1"), { mimeType: "application/pdf" }));
    expect(fakeDownloads()).toEqual(["https://files.example/fresh"]);
  });

  it("explains a file that won't open", async () => {
    const server = startCalendarServer({ events: [aBookingThisMonth()], attachments: { e1: [anAttachment()] } });
    await openBooking();
    const open = await screen.findByRole("button", { name: "Open confirmation.pdf" });
    server.attachments.e1 = [anAttachment({ presigned_url: null })];
    await fireEvent.press(open);
    expect(await screen.findByText("I couldn't open that file. Want to try again?")).toBeTruthy();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("says a missing file is missing rather than offering to open it", async () => {
    startCalendarServer({ events: [aBookingThisMonth()], attachments: { e1: [anAttachment({ is_available: false, presigned_url: null })] } });
    await openBooking();
    expect(await screen.findByText("File missing")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open confirmation.pdf" })).toBeNull();
  });

  it("uploads a file and lists it", async () => {
    const server = startCalendarServer({ events: [aBookingThisMonth()] });
    await openBooking();
    await fireEvent.press(await screen.findByRole("button", { name: "Add a file" }));
    expect(screen.getByRole("button", { name: "Upload file" })).toBeDisabled();
    await chooseFile();
    await fireEvent.press(screen.getByRole("button", { name: "Upload file" }));

    expect(await screen.findByText("File added.")).toBeTruthy();
    const post = server.requests.find((request) => request.method === "post");
    expect(post!.url).toBe("/listings/blackouts/e1/attachments");
    expect(formParts(post!.data).find((part) => part.fieldName === "file")).toMatchObject({ name: "receipt.pdf", type: "application/pdf" });
    expect(await screen.findByText("receipt.pdf")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Upload file" })).toBeNull();
  });

  it("shows a busy button the moment it's pressed", async () => {
    startCalendarServer({ events: [aBookingThisMonth()] });
    await openBooking();
    await fireEvent.press(await screen.findByRole("button", { name: "Add a file" }));
    await chooseFile();
    holdWrites();
    await fireEvent.press(screen.getByRole("button", { name: "Upload file" }));
    expect(await screen.findByRole("button", { name: "Uploading…" })).toBeDisabled();
  });

  it("refuses a kind of file the server won't take, without sending it", async () => {
    const server = startCalendarServer({ events: [aBookingThisMonth()] });
    await openBooking();
    await fireEvent.press(await screen.findByRole("button", { name: "Add a file" }));
    await chooseFile("movie.mov", "video/quicktime");
    await fireEvent.press(screen.getByRole("button", { name: "Upload file" }));
    expect(await screen.findByText("I can only take photos, PDFs, and text files.")).toBeTruthy();
    expect(server.requests.some((request) => request.method === "post")).toBe(false);
  });

  it("cancels back to the one button", async () => {
    startCalendarServer({ events: [aBookingThisMonth()] });
    await openBooking();
    await fireEvent.press(await screen.findByRole("button", { name: "Add a file" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Add a file" })).toBeTruthy();
  });

  it.each([
    [403, "You have view-only access."],
    [404, "I can't find that booking anymore. Pull down to refresh the calendar."],
    [413, "That file is over 25 MB. Pick a smaller one."],
    [415, "I can only take photos, PDFs, and text files."],
    [503, "File storage isn't available right now. Try again in a little while."],
    [500, "I couldn't upload that file. Want to try again?"],
  ])("says what went wrong uploading on a %i, keeps the file, and lets it retry", async (status, message) => {
    const server = startCalendarServer({ events: [aBookingThisMonth()], writeFailure: status });
    await openBooking();
    await fireEvent.press(await screen.findByRole("button", { name: "Add a file" }));
    await chooseFile();
    await fireEvent.press(screen.getByRole("button", { name: "Upload file" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("A developer's message")).toBeNull();

    server.writeFailure = null;
    await fireEvent.press(screen.getByRole("button", { name: "Upload file" }));
    expect(await screen.findByText("File added.")).toBeTruthy();
  });

  it("says so when offline while uploading", async () => {
    const server = startCalendarServer({ events: [aBookingThisMonth()] });
    await openBooking();
    await fireEvent.press(await screen.findByRole("button", { name: "Add a file" }));
    await chooseFile();
    server.offline = true;
    await fireEvent.press(screen.getByRole("button", { name: "Upload file" }));
    expect(await screen.findByText("I couldn't upload that file. Want to try again?")).toBeTruthy();
  });

  it("removes a file only after asking", async () => {
    const server = startCalendarServer({ events: [aBookingThisMonth()], attachments: { e1: [anAttachment()] } });
    await openBooking();
    await fireEvent.press(await screen.findByRole("button", { name: "Remove confirmation.pdf" }));
    expect(Alert.alert).toHaveBeenCalledWith("Remove this file?", "It will be gone from this booking.", expect.any(Array));
    expect(server.requests.some((request) => request.method === "delete")).toBe(false);

    await act(async () => alertButton("Remove")?.onPress?.());
    expect(await screen.findByText("File removed.")).toBeTruthy();
    expect(await screen.findByText("No attachments yet.")).toBeTruthy();
  });

  it.each([
    [403, "You have view-only access."],
    [404, "That file is already gone."],
    [500, "I couldn't remove that file. Want to try again?"],
  ])("says what went wrong removing on a %i and keeps the file listed", async (status, message) => {
    startCalendarServer({ events: [aBookingThisMonth()], attachments: { e1: [anAttachment()] }, writeFailure: status });
    await openBooking();
    await fireEvent.press(await screen.findByRole("button", { name: "Remove confirmation.pdf" }));
    await act(async () => alertButton("Remove")?.onPress?.());
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByText("confirmation.pdf")).toBeTruthy();
  });

  it("lets someone who can only read open files but not add or remove them", async () => {
    startCalendarServer({ events: [aBookingThisMonth()], attachments: { e1: [anAttachment()] }, role: "viewer" });
    await openBooking();
    expect(await screen.findByRole("button", { name: "Open confirmation.pdf" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove confirmation.pdf" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a file" })).toBeNull();
  });
});
