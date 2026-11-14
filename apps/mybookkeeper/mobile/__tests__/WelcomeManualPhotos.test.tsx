import "@platform/mobile/test-support/reactNativeFormData";
import api from "@platform/core/lib/api";
import { WELCOME_MANUAL_MAX_SECTION_IMAGES, SECTION_IMAGE_MAX_BYTES } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import type { AxiosAdapter } from "axios";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
import { WELCOME_MANUAL_FAILURE_MESSAGES as FAILURE, notSureItSavedMessage } from "../src/constants/welcomeManualFailures";
import { DELETE_PHOTO_TITLE, WELCOME_MANUAL_PHOTO_MESSAGES as PHOTO, WELCOME_MANUAL_REORDER_MESSAGES as REORDER, moveDownLabel, moveUpLabel, photosLeftLabel, unnamedPhotoLabel } from "../src/constants/welcomeManualForms";
import { removeHeldFileLabel, UPLOAD_MESSAGES } from "../src/constants/uploads";
import WelcomeManualPhotosScreen from "../src/features/welcomeManuals/WelcomeManualPhotosScreen";
import { preparePhoto } from "../src/features/capture/preparePhoto";
import { aManual, anImage, aSection } from "../test-support/aWelcomeManual";
import { fakeFiles, File, resetFakeFiles, setFakeFileSize } from "@platform/mobile/test-support/fakeFileSystem";
import { pressAlertButton } from "../test-support/pressAlertButton";
import { renderScreen, resetSignedInStore } from "../test-support/renderScreen";
import { startWelcomeManualsServer } from "../test-support/welcomeManualsServer";
import { writesTo } from "../test-support/writesTo";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePreventRemove: () => undefined,
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn(), launchCameraAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("../src/features/capture/preparePhoto", () => ({ preparePhoto: jest.fn(async (uri: string) => uri) }));

const originalAdapter = api.defaults.adapter;
let alertSpy: jest.SpiedFunction<typeof Alert.alert>;
let counter = 0;

beforeEach(() => {
  resetSignedInStore();
  jest.clearAllMocks();
  resetFakeFiles();
  jest.mocked(preparePhoto).mockReset().mockImplementation(async (uri: string) => uri);
  counter = 0;
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const withPhotos = (images = [anImage({ id: "i1", caption: "The router" }), anImage({ id: "i2", caption: null, display_order: 1 })]) =>
  aManual({ sections: [aSection({ id: "s1", images })] });
const open = () => renderScreen(<WelcomeManualPhotosScreen manualId="m1" sectionId="s1" />);

function libraryResult(count: number, size?: number): ImagePicker.ImagePickerResult {
  const assets = Array.from({ length: count }, () => {
    counter += 1;
    const uri = `cache:/pick${counter}.jpg`;
    new File(uri).create();
    if (size !== undefined) setFakeFileSize(uri, size);
    return { uri, width: 800, height: 600 };
  });
  return { canceled: false, assets } as ImagePicker.ImagePickerResult;
}

async function fromLibrary(count: number, size?: number): Promise<void> {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(libraryResult(count, size));
  await fireEvent.press(button(UPLOAD_MESSAGES.photoLibrary));
}

async function fromFile(name: string, mimeType = "image/jpeg"): Promise<void> {
  counter += 1;
  const uri = `cache:/doc${counter}-${name}`;
  new File(uri).create();
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({ canceled: false, assets: [{ uri, name, mimeType }] } as DocumentPicker.DocumentPickerResult);
  await fireEvent.press(button(UPLOAD_MESSAGES.chooseFile));
  await waitFor(() => expect(fakeFiles().some((path) => path.includes("held-uploads"))).toBe(true));
}

const heldFiles = () => fakeFiles().filter((uri) => uri.includes("held-uploads"));

/** Holds the upload's answer back, so a test can do something while the request is still out. */
function holdUploadAnswer(): { isWaiting: () => boolean; release: () => void } {
  const inner = api.defaults.adapter as AxiosAdapter;
  let release: (() => void) | null = null;
  api.defaults.adapter = (config) =>
    config.method === "post" && config.url?.endsWith("/images")
      ? new Promise((resolve, reject) => { release = () => inner(config).then(resolve, reject); })
      : inner(config);
  return { isWaiting: () => release !== null, release: () => release?.() };
}

describe("the photos of a section", () => {
  it("lists them with their captions", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos()] });
    await open();
    await screen.findByRole("button", { name: "Photo, The router" });
    expect(screen.getByRole("button", { name: `Photo, ${PHOTO.noCaption}` })).toBeTruthy();
  });

  it("offers to add the first one when there are none", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos([])] });
    await open();
    await screen.findByText(PHOTO.none);
    expect(screen.getByRole("button", { name: PHOTO.add })).toBeTruthy();
  });

  it("offers a retry when the manual won't load, and recovers", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos()] });
    server.failReadsWith = 500;
    await open();
    server.failReadsWith = null;
    await fireEvent.press(await screen.findByRole("button", { name: /try again|retry/i }));
    await screen.findByRole("button", { name: "Photo, The router" });
  });

  it("gives a viewer a look at a photo, but nothing to change", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos()], role: "viewer" });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: "Photo, The router" }));
    expect(screen.queryByRole("button", { name: /^Edit photo/ })).toBeNull();
    expect(screen.queryByRole("button", { name: PHOTO.save })).toBeNull();
    expect(screen.queryByRole("button", { name: PHOTO.delete })).toBeNull();
    expect(screen.queryByRole("button", { name: PHOTO.add })).toBeNull();
    expect(screen.queryByRole("button", { name: PHOTO.reorder })).toBeNull();
  });

  it("opens a viewer at the tapped photo for someone who can only look", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos()], role: "viewer" });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: `Photo, ${PHOTO.noCaption}` }));
    expect(screen.getByText("2 of 2")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close photo viewer" }));
    expect(screen.queryByText("2 of 2")).toBeNull();
  });
});

describe("viewing as someone who can change photos", () => {
  it("pages through the photos and edits the one on screen", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: "Photo, The router" }));
    await fireEvent.press(button("Next photo"));
    await fireEvent.press(button("Edit photo 2 of 2"));
    expect(screen.queryByText("2 of 2")).toBeNull();
    expect(button(PHOTO.save)).toBeTruthy();
    expect(screen.getByLabelText(PHOTO.captionLabel).props.value).toBe("");
  });
});

describe("adding photos", () => {
  const upload = () => button(PHOTO.upload);
  const uploads = (server: ReturnType<typeof startWelcomeManualsServer>) => server.requests.filter((request) => request.method === "post" && request.url?.endsWith("/images"));
  const sentNames = (server: ReturnType<typeof startWelcomeManualsServer>) => server.manuals[0].sections[0].images.map((image) => image.storage_key);
  const openUploadSheet = async () => fireEvent.press(await screen.findByRole("button", { name: PHOTO.add }));

  it("sends every photo held in one request, named apart, and says so", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos([])] });
    await open();
    await openUploadSheet();
    await fromLibrary(2);
    await screen.findByText("photo-1.jpg");
    await fireEvent.press(upload());
    await screen.findByText(PHOTO.uploadedMany);
    expect(uploads(server)).toHaveLength(1);
    expect(sentNames(server)).toEqual(["photo-1.jpg", "photo-2.jpg"]);
    expect(await screen.findAllByRole("button", { name: `Photo, ${PHOTO.noCaption}` })).toHaveLength(2);
    expect(heldFiles()).toHaveLength(0);
  });

  it("shows a small picture of each photo held", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos([])] });
    await open();
    await openUploadSheet();
    await fromLibrary(2);
    await screen.findByText("photo-2.jpg");
    const thumbnails = screen.getAllByTestId("held-file-thumbnail");
    expect(thumbnails).toHaveLength(2);
    expect(thumbnails.map((thumbnail) => (thumbnail.props.source as { uri: string }).uri)).toEqual(heldFiles());
  });

  it("lets the library hand over only as many as still fit, and says how many that is", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos(Array.from({ length: 18 }, (_, i) => anImage({ id: `i${i}`, display_order: i })))] });
    await open();
    await openUploadSheet();
    expect(screen.getByText(photosLeftLabel(2))).toBeTruthy();
    await fromLibrary(1);
    await screen.findByText("photo-1.jpg");
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsMultipleSelection: true, selectionLimit: 2 }));
    expect(screen.getByText(photosLeftLabel(1))).toBeTruthy();
  });

  it("offers no more once the section holds as many as it can", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos(Array.from({ length: WELCOME_MANUAL_MAX_SECTION_IMAGES }, (_, i) => anImage({ id: `i${i}`, display_order: i })))] });
    await open();
    await screen.findByText(PHOTO.atLimit);
    expect(screen.queryByRole("button", { name: PHOTO.add })).toBeNull();
  });

  it("says how far along it is while photos are made ready", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos([])] });
    const finish: (() => void)[] = [];
    for (let i = 0; i < 2; i += 1) jest.mocked(preparePhoto).mockImplementationOnce((uri: string) => new Promise<string>((resolve) => finish.push(() => resolve(uri))));
    await open();
    await openUploadSheet();
    await fromLibrary(2);
    await screen.findByText("Preparing 1 of 2");
    await act(async () => finish[0]());
    await screen.findByText("Preparing 2 of 2");
    await act(async () => finish[1]());
    await screen.findByText("photo-2.jpg");
  });

  it("names two files that arrived with the same name apart, and takes back the one asked for", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos([])] });
    await open();
    await openUploadSheet();
    await fromFile("IMG_0001.jpg");
    await fromFile("IMG_0001.jpg");
    await screen.findByText("photo-2.jpg");
    expect(screen.getByRole("button", { name: removeHeldFileLabel("photo-1.jpg") })).toBeTruthy();
    await fireEvent.press(button(removeHeldFileLabel("photo-1.jpg")));
    expect(screen.queryByText("photo-1.jpg")).toBeNull();
    expect(screen.getByText("photo-2.jpg")).toBeTruthy();
  });

  it("only offers JPEG and PNG from the files, since the server can't read HEIC", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos([])] });
    await open();
    await openUploadSheet();
    await fromFile("IMG_0001.jpg");
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(expect.objectContaining({ type: ["image/jpeg", "image/png"] }));
  });

  it("takes a photo with the camera", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos([])] });
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: true } as ImagePicker.CameraPermissionResponse);
    jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue(libraryResult(1));
    await open();
    await openUploadSheet();
    await fireEvent.press(button(PHOTO.takePhoto));
    await screen.findByText("photo-1.jpg");
  });

  it("explains a camera that isn't allowed, and holds nothing", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos([])] });
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: false } as ImagePicker.CameraPermissionResponse);
    await open();
    await openUploadSheet();
    await fireEvent.press(button(PHOTO.takePhoto));
    await screen.findByText(UPLOAD_MESSAGES.cameraDenied);
    expect(screen.getByText(PHOTO.noneChosen)).toBeTruthy();
  });

  it("asks for a photo first, and sends nothing", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos([])] });
    await open();
    await openUploadSheet();
    await fireEvent.press(upload());
    expect(screen.getAllByText(PHOTO.noneChosen).length).toBeGreaterThan(0);
    expect(writesTo(server)).toHaveLength(0);
  });

  it("turns a photo over 10MB away before sending anything, naming it", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos([])] });
    await open();
    await openUploadSheet();
    await fromLibrary(1, SECTION_IMAGE_MAX_BYTES + 1);
    await screen.findByText("photo-1.jpg");
    await fireEvent.press(upload());
    await screen.findByText("photo-1.jpg is over 10MB");
    expect(writesTo(server)).toHaveLength(0);
  });

  it("turns a file of a type that isn't accepted away before sending anything", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos([])] });
    await open();
    await openUploadSheet();
    await fromFile("scan.bmp", "image/bmp");
    await screen.findByText("photo-1.jpg");
    await fireEvent.press(upload());
    expect(await screen.findByText(/not a supported image type/)).toBeTruthy();
    expect(writesTo(server)).toHaveLength(0);
  });

  it.each([
    ["too big", "huge", 413, FAILURE.tooBig, "file exceeds 10MB limit"],
    ["an unsupported type the server refuses", "odd", 415, FAILURE.badType, "unsupported file type"],
  ])("explains a photo that is %s in its own words, never the server's, and keeps what was held", async (_what, _key, status, copy, serverWords) => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos([])] });
    server.failWhen = () => ({ status, detail: serverWords });
    await open();
    await openUploadSheet();
    await fromLibrary(1);
    await screen.findByText("photo-1.jpg");
    await fireEvent.press(upload());
    await screen.findByText(copy);
    expect(screen.queryByText(new RegExp(serverWords))).toBeNull();
    expect(screen.getByText("photo-1.jpg")).toBeTruthy();
  });

  it("no longer promises HEIC", () => {
    expect(FAILURE.badType).not.toMatch(/heic/i);
  });

  it("shows the server's own words when the section is full", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos([anImage({ id: "i1" })])] });
    await open();
    await openUploadSheet();
    await fromLibrary(1);
    await screen.findByText("photo-1.jpg");
    // Another device filled the section meanwhile.
    server.manuals[0].sections[0].images = Array.from({ length: WELCOME_MANUAL_MAX_SECTION_IMAGES }, (_, i) => anImage({ id: `x${i}`, display_order: i }));
    await fireEvent.press(upload());
    await screen.findByText(`A section can have at most ${WELCOME_MANUAL_MAX_SECTION_IMAGES} photos`);
  });

  it("says storage isn't set up when the server has none", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos([])] });
    server.storageConfigured = false;
    await open();
    await openUploadSheet();
    await fromLibrary(1);
    await screen.findByText("photo-1.jpg");
    await fireEvent.press(upload());
    await screen.findByText(FAILURE.noStorage);
    expect(screen.getByText("photo-1.jpg")).toBeTruthy();
  });

  it.each([
    ["the answer is lost", (server: ReturnType<typeof startWelcomeManualsServer>) => { server.loseAnswerAfterSaving = true; }],
    ["the server fails", (server: ReturnType<typeof startWelcomeManualsServer>) => { server.failWhen = () => ({ status: 500, detail: "boom" }); }],
  ])("says it isn't sure the photos saved when %s, so none are added twice", async (_what, breakIt) => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos([])] });
    breakIt(server);
    await open();
    await openUploadSheet();
    await fromLibrary(1);
    await screen.findByText("photo-1.jpg");
    await fireEvent.press(upload());
    await screen.findByText(notSureItSavedMessage("photos"));
    expect(screen.queryByText(/^I couldn't upload/)).toBeNull();
    expect(screen.getByText("photo-1.jpg")).toBeTruthy();
  });

  it("lets the upload be tried again after a failure", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos([])] });
    server.storageConfigured = false;
    await open();
    await openUploadSheet();
    await fromLibrary(1);
    await screen.findByText("photo-1.jpg");
    await fireEvent.press(upload());
    await screen.findByText(FAILURE.noStorage);
    server.storageConfigured = true;
    await fireEvent.press(upload());
    await screen.findByText(PHOTO.uploadedOne);
  });

  it("keeps the held photos on disk until the upload settles, even if the screen goes meanwhile", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos([])] });
    const answer = holdUploadAnswer();
    await open();
    await openUploadSheet();
    await fromLibrary(1);
    await screen.findByText("photo-1.jpg");
    await fireEvent.press(upload());
    await waitFor(() => expect(answer.isWaiting()).toBe(true));
    await screen.unmount();
    expect(heldFiles()).toHaveLength(1);
    await act(async () => answer.release());
    await waitFor(() => expect(heldFiles()).toHaveLength(0));
    expect(uploads(server)).toHaveLength(1);
  });

  it("lets go of the held photos when the screen goes with nothing in flight", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos([])] });
    await open();
    await openUploadSheet();
    await fromLibrary(1);
    await screen.findByText("photo-1.jpg");
    expect(heldFiles()).toHaveLength(1);
    await screen.unmount();
    expect(heldFiles()).toHaveLength(0);
  });

  it("asks before throwing away photos that weren't sent", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos([])] });
    await open();
    await openUploadSheet();
    await fromLibrary(1);
    await screen.findByText("photo-1.jpg");
    await fireEvent.press(button(PHOTO.cancel));
    expect(alertSpy).toHaveBeenCalled();
  });

  it("closes without asking when nothing is held", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos([])] });
    await open();
    await openUploadSheet();
    await fireEvent.press(button(PHOTO.cancel));
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe("changing a photo", () => {
  const openPhoto = async () => {
    await fireEvent.press(await screen.findByRole("button", { name: "Photo, The router" }));
    await fireEvent.press(screen.getByRole("button", { name: "Edit photo 1 of 2" }));
  };

  it("changes the caption, sending only that", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos()] });
    await open();
    await openPhoto();
    await fireEvent.changeText(screen.getByLabelText(PHOTO.captionLabel), "The new router");
    await fireEvent.press(button(PHOTO.save));
    await screen.findByText(PHOTO.saved);
    expect(writesTo(server)).toEqual([{ method: "patch", url: "/welcome-manuals/m1/sections/s1/images/i1", body: { caption: "The new router" } }]);
  });

  it("clears a caption that was emptied", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos()] });
    await open();
    await openPhoto();
    await fireEvent.changeText(screen.getByLabelText(PHOTO.captionLabel), "  ");
    await fireEvent.press(button(PHOTO.save));
    await screen.findByText(PHOTO.saved);
    expect(writesTo(server)[0].body).toEqual({ caption: null });
  });

  it("asks before discarding a caption that wasn't saved", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos()] });
    await open();
    await openPhoto();
    await fireEvent.changeText(screen.getByLabelText(PHOTO.captionLabel), "Changed");
    await fireEvent.press(button(PHOTO.cancel));
    expect(alertSpy).toHaveBeenCalled();
  });

  it("deletes after confirming", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos()] });
    await open();
    await openPhoto();
    await fireEvent.press(button(PHOTO.delete));
    expect(alertSpy.mock.calls.at(-1)?.[0]).toBe(DELETE_PHOTO_TITLE);
    expect(writesTo(server)).toHaveLength(0);
    await pressAlertButton(alertSpy, PHOTO.delete);
    await screen.findByText(PHOTO.deleted);
    expect(writesTo(server)).toEqual([{ method: "delete", url: "/welcome-manuals/m1/sections/s1/images/i1", body: {} }]);
  });

  it("treats a photo deleted elsewhere as already gone", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos()] });
    await open();
    await openPhoto();
    server.manuals[0].sections[0].images = [];
    await fireEvent.press(button(PHOTO.delete));
    await pressAlertButton(alertSpy, PHOTO.delete);
    await screen.findByText(PHOTO.alreadyDeleted);
  });

  it("explains a failed save and keeps the caption", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos()] });
    server.failWhen = () => ({ status: 500, detail: "boom" });
    await open();
    await openPhoto();
    await fireEvent.changeText(screen.getByLabelText(PHOTO.captionLabel), "Changed");
    await fireEvent.press(button(PHOTO.save));
    await screen.findByText(/couldn't/i);
    expect(screen.getByDisplayValue("Changed")).toBeTruthy();
  });
});

describe("reordering photos", () => {
  it("sends the whole new order once, when saved", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: PHOTO.reorder }));
    await fireEvent.press(button(moveDownLabel("The router")));
    expect(writesTo(server)).toHaveLength(0);
    await fireEvent.press(button(REORDER.save));
    await screen.findByText(REORDER.saved);
    expect(writesTo(server)).toEqual([{ method: "put", url: "/welcome-manuals/m1/sections/s1/images/order", body: { image_ids: ["i2", "i1"] } }]);
  });

  it("shows each photo as a picture, and names an uncaptioned one by where it is now as it moves", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: PHOTO.reorder }));
    expect(screen.getAllByTestId("reorder-thumbnail").map((thumbnail) => (thumbnail.props.source as { uri: string }).uri)).toEqual(["https://files.example/i1.jpg", "https://files.example/i1.jpg"]);
    expect(screen.getAllByText("The router").length).toBeGreaterThan(1);
    expect(screen.getByText(unnamedPhotoLabel(2))).toBeTruthy();
    await fireEvent.press(button(moveUpLabel(unnamedPhotoLabel(2))));
    expect(screen.getByText(unnamedPhotoLabel(1))).toBeTruthy();
    expect(screen.queryByText(unnamedPhotoLabel(2))).toBeNull();
    expect(screen.getByRole("button", { name: moveDownLabel(unnamedPhotoLabel(1)) })).toBeTruthy();
  });

  it("reloads once, says so in its own words, and never shows the server's, when the list changed elsewhere", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos()] });
    server.listChangedElsewhere = true;
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: PHOTO.reorder }));
    await fireEvent.press(button(moveDownLabel("The router")));
    const manualReads = () => server.requests.filter((request) => request.method === "get" && request.url === "/welcome-manuals/m1").length;
    const before = manualReads();
    await fireEvent.press(button(REORDER.save));
    await screen.findByText(REORDER.stale);
    await waitFor(() => expect(screen.queryByText(REORDER.save)).toBeNull());
    await waitFor(() => expect(manualReads()).toBe(before + 1));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(manualReads()).toBe(before + 1);
    expect(screen.queryByText(/permutation/)).toBeNull();
  });
});
