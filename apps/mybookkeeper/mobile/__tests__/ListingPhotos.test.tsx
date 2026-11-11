import "@platform/mobile/test-support/reactNativeFormData";
import { listingsApi } from "@mybookkeeper/api-client/store/listingsApi";
import { store } from "../src/lib/store";
import api from "@platform/core/lib/api";
import type { AxiosAdapter } from "axios";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { LISTING_PHOTO_MESSAGES as MESSAGES, removeManyTitle } from "../src/constants/listingPhotos";
import { LISTING_MESSAGES } from "../src/constants/listings";
import ListingPhotosScreen from "../src/features/listings/ListingPhotosScreen";
import { preparePhoto } from "../src/features/capture/preparePhoto";
import { formParts } from "../test-support/applicantsServer";
import { fakeDownloads, fakeFiles, File, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { aListing, aPhoto, startListingsServer, writesTo } from "../test-support/listingsServer";
import { mockPreventRemove, pressAlertButton, restoreApi, show, signInToWorkspace } from "../test-support/listingsHarness";

jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-router", () => jest.requireActual("../test-support/listingsHarness").expoRouterMock());
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn(), launchCameraAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock("../src/features/capture/preparePhoto", () => ({ preparePhoto: jest.fn(async (uri: string) => uri) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  alertSpy = signInToWorkspace();
  resetFakeFiles();
  jest.mocked(preparePhoto).mockReset().mockImplementation(async (uri: string) => uri);
});
afterEach(restoreApi);

const heldFiles = () => fakeFiles().filter((uri) => uri.includes("held-uploads"));
const button = (name: string) => screen.getByRole("button", { name });

function pickFromLibrary(count: number): void {
  const assets = Array.from({ length: count }, (_, index) => {
    const uri = `cache:/pick${index}.jpg`;
    new File(uri).create();
    return { uri, width: 800, height: 600 };
  });
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets } as ImagePicker.ImagePickerResult);
}

async function addFromLibrary(count: number): Promise<void> {
  pickFromLibrary(count);
  await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.add }));
  await fireEvent.press(await screen.findByRole("radio", { name: MESSAGES.fromLibrary }));
}

const twoPhotos = () => [aPhoto("a", 0), aPhoto("b", 1)];

describe("a listing's photos", () => {
  it("offers to add the first one when there are none", async () => {
    startListingsServer();
    await show(<ListingPhotosScreen id="l1" />);
    await screen.findByText(MESSAGES.noneHeading);
    expect(button(MESSAGES.add)).toBeTruthy();
  });

  it("tells a viewer with no photos that someone else adds them", async () => {
    startListingsServer({ role: "viewer" });
    await show(<ListingPhotosScreen id="l1" />);
    await screen.findByText(MESSAGES.noneViewOnlyBody);
    expect(screen.queryByRole("button", { name: MESSAGES.add })).toBeNull();
  });

  it("offers a retry when the listing couldn't load, and recovers", async () => {
    const server = startListingsServer();
    server.failReadsFor = ["/listings/l1"];
    await show(<ListingPhotosScreen id="l1" />);
    await screen.findByText(LISTING_MESSAGES.couldntLoadOne);
    server.failReadsFor = [];
    await fireEvent.press(button(LISTING_MESSAGES.tryAgain));
    await screen.findByText(MESSAGES.noneHeading);
  });

  it("shows the cover first, in order, and a placeholder for a photo that can't be fetched", async () => {
    startListingsServer({ listings: [aListing({ photos: [aPhoto("b", 1, { presigned_url: null }), aPhoto("a", 0)] })] });
    await show(<ListingPhotosScreen id="l1" />);
    await screen.findByRole("button", { name: "Photo 1 of 2, Cover" });
    expect(screen.getByRole("button", { name: "Photo 2 of 2, Photo unavailable" })).toBeTruthy();
  });

  it("gives a viewer the photos and no way to change them", async () => {
    startListingsServer({ role: "viewer", listings: [aListing({ photos: twoPhotos() })] });
    await show(<ListingPhotosScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Photo 1 of 2, Cover" }));
    await screen.findByText("Photo 1 of 2");
    for (const name of [MESSAGES.add, MESSAGES.select, MESSAGES.remove, MESSAGES.later, MESSAGES.makeCover]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(button(MESSAGES.shareOne)).toBeTruthy();
  });
});

describe("adding photos", () => {
  it("sends each photo on its own, says so, and clears the held copies", async () => {
    const server = startListingsServer({ listings: [aListing({ photos: [aPhoto("a", 0)] })] });
    await show(<ListingPhotosScreen id="l1" />);
    await addFromLibrary(2);
    await screen.findByText(MESSAGES.uploadedMany);
    const uploads = writesTo(server, "post", "/photos");
    expect(uploads).toHaveLength(2);
    const sent = server.requests.filter((request) => request.method === "post").map((request) => formParts(request.data));
    expect(sent.map((parts) => parts.map((part) => [part.fieldName, part.type]))).toEqual([[["files", "image/jpeg"]], [["files", "image/jpeg"]]]);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Photo \d of 3/ })).toHaveLength(3));
    expect(heldFiles()).toHaveLength(0);
  });

  function deferPreparing(count: number): (() => void)[] {
    const finish: (() => void)[] = [];
    for (let i = 0; i < count; i += 1) {
      jest.mocked(preparePhoto).mockImplementationOnce((uri: string) => new Promise<string>((resolve) => finish.push(() => resolve(uri))));
    }
    return finish;
  }

  it("starts sending the first photo while the rest are still being prepared, and says how far along it is", async () => {
    const server = startListingsServer();
    const finish = deferPreparing(2);
    await show(<ListingPhotosScreen id="l1" />);
    await addFromLibrary(2);
    await screen.findByText("Preparing 1 of 2");
    await act(async () => finish[0]());
    await screen.findByText("Preparing 2 of 2");
    await waitFor(() => expect(writesTo(server, "post", "/photos")).toHaveLength(1));
    expect(mockPreventRemove.active).toBe(true);
    await act(async () => finish[1]());
    await screen.findByText(MESSAGES.uploadedMany);
    expect(writesTo(server, "post", "/photos")).toHaveLength(2);
    expect(screen.queryByText(/^Preparing/)).toBeNull();
    expect(mockPreventRemove.active).toBe(false);
  });

  it("guards leaving while photos are being prepared, before any is ready", async () => {
    startListingsServer();
    deferPreparing(1);
    await show(<ListingPhotosScreen id="l1" />);
    await addFromLibrary(1);
    await screen.findByText("Preparing 1 of 1");
    expect(mockPreventRemove.active).toBe(true);
  });

  it("queues nothing and leaves no files behind when the screen goes away mid-preparing", async () => {
    const server = startListingsServer();
    const finish = deferPreparing(2);
    await show(<ListingPhotosScreen id="l1" />);
    await addFromLibrary(2);
    await screen.findByText("Preparing 1 of 2");
    await screen.unmount();
    await act(async () => finish[0]());
    await act(async () => Promise.resolve());
    expect(writesTo(server, "post", "/photos")).toHaveLength(0);
    expect(heldFiles()).toHaveLength(0);
    expect(fakeFiles().filter((uri) => uri.includes("pick"))).toHaveLength(0);
  });

  it("stops sending the rest of the chain when the screen goes away", async () => {
    startListingsServer();
    await show(<ListingPhotosScreen id="l1" />);
    const answer = api.defaults.adapter as AxiosAdapter;
    const sent: (() => Promise<unknown>)[] = [];
    api.defaults.adapter = (config) => {
      if (config.method?.toLowerCase() !== "post") return answer(config);
      return new Promise((resolve, reject) => sent.push(() => answer(config).then(resolve, reject)));
    };
    await addFromLibrary(3);
    await waitFor(() => expect(sent).toHaveLength(1));
    await screen.unmount();
    // The first one's answer arrives after the screen is gone; the other two must not go.
    await act(async () => {
      await sent[0]();
    });
    await act(async () => Promise.resolve());
    expect(sent).toHaveLength(1);
  });

  it("labels each waiting or failed photo so a button says which one it is for", async () => {
    const server = startListingsServer();
    server.uploadStatuses = [415, 415];
    await show(<ListingPhotosScreen id="l1" />);
    await addFromLibrary(2);
    await screen.findByRole("button", { name: "Retry photo 2" });
    expect(button("Remove photo 1")).toBeTruthy();
    expect(button("Retry photo 1")).toBeTruthy();
    expect(button("Remove photo 2")).toBeTruthy();
  });

  it("keeps a photo that failed, says why, and sends it when tried again", async () => {
    const server = startListingsServer();
    server.uploadStatuses = [0, 413];
    await show(<ListingPhotosScreen id="l1" />);
    await addFromLibrary(2);
    await screen.findByText("That photo is over 10 MB, which is more than a listing can hold.");
    expect(server.listings[0].photos).toHaveLength(1);
    expect(heldFiles()).toHaveLength(1);
    await fireEvent.press(button("Retry photo 1"));
    await screen.findByText(MESSAGES.uploadedOne);
    expect(server.listings[0].photos).toHaveLength(2);
    expect(screen.queryByText(MESSAGES.uploadsTitle)).toBeNull();
    expect(heldFiles()).toHaveLength(0);
  });

  it.each([
    [415, "That kind of file isn't a photo I can use."],
    [503, "Photo storage isn't available right now. Try again in a bit."],
    [403, "You have view-only access, so I can't add photos."],
    [404, "I can't find that listing anymore. It may have been deleted."],
    [500, "I couldn't upload that photo. Want to try again?"],
  ])("says why in fixed words when a photo is refused with %s", async (status, message) => {
    const server = startListingsServer();
    server.uploadStatuses = [status];
    await show(<ListingPhotosScreen id="l1" />);
    await addFromLibrary(1);
    await screen.findByText(message);
  });

  it("says it couldn't reach the server when offline, and keeps the photo", async () => {
    const server = startListingsServer();
    await show(<ListingPhotosScreen id="l1" />);
    server.offline = true;
    await addFromLibrary(1);
    await screen.findByText("I couldn't reach the server. Want to try again?");
    expect(heldFiles()).toHaveLength(1);
  });

  it("lets a failed photo be removed, and lets go of its file", async () => {
    const server = startListingsServer();
    server.uploadStatuses = [415];
    await show(<ListingPhotosScreen id="l1" />);
    await addFromLibrary(1);
    await fireEvent.press(await screen.findByRole("button", { name: "Remove photo 1" }));
    expect(screen.queryByText(MESSAGES.retry)).toBeNull();
    expect(heldFiles()).toHaveLength(0);
  });

  it("asks before leaving with photos that haven't uploaded", async () => {
    const server = startListingsServer();
    server.uploadStatuses = [500];
    await show(<ListingPhotosScreen id="l1" />);
    await screen.findByText(MESSAGES.noneHeading);
    expect(mockPreventRemove.active).toBe(false);
    await addFromLibrary(1);
    await screen.findByText(MESSAGES.retry);
    expect(mockPreventRemove.active).toBe(true);
    const leave = jest.fn();
    await act(async () => mockPreventRemove.callback?.({ repeat: leave }));
    expect(alertSpy.mock.calls.at(-1)?.slice(0, 2)).toEqual([MESSAGES.discardTitle, MESSAGES.discardBody]);
    await pressAlertButton(alertSpy, MESSAGES.leave, act);
    expect(leave).toHaveBeenCalled();
  });

  it("takes a photo with the camera", async () => {
    const server = startListingsServer();
    new File("cache:/shot.jpg").create();
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: true } as ImagePicker.CameraPermissionResponse);
    jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue({ canceled: false, assets: [{ uri: "cache:/shot.jpg", width: 800, height: 600 }] } as ImagePicker.ImagePickerResult);
    await show(<ListingPhotosScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.add }));
    await fireEvent.press(await screen.findByRole("radio", { name: MESSAGES.takePhoto }));
    await screen.findByText(MESSAGES.uploadedOne);
    expect(server.listings[0].photos).toHaveLength(1);
  });

  it("explains when camera access is turned off, and sends nothing", async () => {
    const server = startListingsServer();
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: false } as ImagePicker.CameraPermissionResponse);
    await show(<ListingPhotosScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.add }));
    await fireEvent.press(await screen.findByRole("radio", { name: MESSAGES.takePhoto }));
    await screen.findByText(MESSAGES.cameraDenied);
    expect(writesTo(server, "post")).toHaveLength(0);
  });
});

describe("working with a photo", () => {
  const withTwo = () => startListingsServer({ listings: [aListing({ photos: twoPhotos() })] });
  const open = async (name: string) => fireEvent.press(await screen.findByRole("button", { name }));

  it("steps through the photos", async () => {
    withTwo();
    await show(<ListingPhotosScreen id="l1" />);
    await open("Photo 1 of 2, Cover");
    await fireEvent.press(button(MESSAGES.next));
    expect(screen.getByText("Photo 2 of 2")).toBeTruthy();
    expect(button(MESSAGES.next).props.accessibilityState.disabled).toBe(true);
  });

  it("makes a photo the cover with one request that sets the whole order", async () => {
    const server = withTwo();
    await show(<ListingPhotosScreen id="l1" />);
    await open("Photo 2 of 2");
    await fireEvent.press(button(MESSAGES.makeCover));
    await screen.findByText(MESSAGES.moved);
    expect(writesTo(server, "patch")).toHaveLength(0);
    expect(writesTo(server, "put")).toEqual([{ url: "/listings/l1/photos/order", body: { photo_ids: ["b", "a"] } }]);
    expect(server.listings[0].photos.map((photo) => [photo.id, photo.display_order])).toEqual([["b", 0], ["a", 1]]);
    await screen.findByText("Photo 1 of 2");
  });

  it("moves a photo later and keeps showing that same photo", async () => {
    const server = startListingsServer({ listings: [aListing({ photos: [aPhoto("a", 0, { caption: "Kitchen" }), aPhoto("b", 1)] })] });
    await show(<ListingPhotosScreen id="l1" />);
    await open("Photo 1 of 2, Kitchen, Cover");
    await fireEvent.press(button(MESSAGES.later));
    await screen.findByText(MESSAGES.moved);
    expect(writesTo(server, "put")).toEqual([{ url: "/listings/l1/photos/order", body: { photo_ids: ["b", "a"] } }]);
    expect(await screen.findByText("Photo 2 of 2")).toBeTruthy();
    expect(screen.getAllByText("Kitchen").length).toBeGreaterThan(0);
  });

  it("says so and leaves the order alone when a reorder fails", async () => {
    const server = withTwo();
    await show(<ListingPhotosScreen id="l1" />);
    await open("Photo 2 of 2");
    server.failWrites.push({ match: "/photos/order", status: 500 });
    await fireEvent.press(button(MESSAGES.makeCover));
    await screen.findByText("I couldn't change the order. Want to try again?");
    expect(server.listings[0].photos.map((photo) => photo.id)).toEqual(["a", "b"]);
    expect(screen.getByText("Photo 2 of 2")).toBeTruthy();
  });

  it("refreshes and says so in fixed words when the order was made from a stale list", async () => {
    const server = withTwo();
    await show(<ListingPhotosScreen id="l1" />);
    await open("Photo 2 of 2");
    // Another device removed photo a after this screen loaded it.
    server.listings[0].photos = [aPhoto("b", 0)];
    await fireEvent.press(button(MESSAGES.makeCover));
    await screen.findByText(MESSAGES.orderStale);
    expect(server.listings[0].photos.map((photo) => photo.id)).toEqual(["b"]);
  });

  it("closes the viewer when the photo it shows is removed elsewhere", async () => {
    const server = withTwo();
    await show(<ListingPhotosScreen id="l1" />);
    await open("Photo 2 of 2");
    server.listings[0].photos = [aPhoto("a", 0)];
    await act(async () => {
      store.dispatch(listingsApi.util.invalidateTags([{ type: "Listing", id: "l1" }]));
    });
    await waitFor(() => expect(screen.queryByText(MESSAGES.close)).toBeNull());
    expect(screen.getByRole("button", { name: "Photo 1 of 1, Cover" })).toBeTruthy();
  });

  it("shows a photo's caption in its tile and in the viewer", async () => {
    startListingsServer({ listings: [aListing({ photos: [aPhoto("a", 0, { caption: "Living room" }), aPhoto("b", 1)] })] });
    await show(<ListingPhotosScreen id="l1" />);
    expect(screen.getByText("Living room")).toBeTruthy();
    await open("Photo 1 of 2, Living room, Cover");
    expect(screen.getAllByText("Living room")).toHaveLength(2);
  });

  it("asks before removing a photo, and says what happens", async () => {
    const server = withTwo();
    await show(<ListingPhotosScreen id="l1" />);
    await open("Photo 1 of 2, Cover");
    await fireEvent.press(button(MESSAGES.remove));
    expect(alertSpy.mock.calls.at(-1)?.slice(0, 2)).toEqual([MESSAGES.removeOneTitle, MESSAGES.removeOneBody]);
    expect(writesTo(server, "delete")).toHaveLength(0);
  });

  it("removes a photo after confirming, and closes the viewer", async () => {
    const server = withTwo();
    await show(<ListingPhotosScreen id="l1" />);
    await open("Photo 1 of 2, Cover");
    await fireEvent.press(button(MESSAGES.remove));
    await pressAlertButton(alertSpy, MESSAGES.remove, act);
    await screen.findByText(MESSAGES.removed);
    expect(writesTo(server, "delete")).toEqual([{ url: "/listings/l1/photos/a", body: {} }]);
    await waitFor(() => expect(screen.queryByText("Photo 1 of 2")).toBeNull());
  });

  it("keeps the photo and says so when removing fails", async () => {
    const server = withTwo();
    await show(<ListingPhotosScreen id="l1" />);
    await open("Photo 1 of 2, Cover");
    await fireEvent.press(button(MESSAGES.remove));
    server.failWrites.push({ match: "/photos/a", status: 500 });
    await pressAlertButton(alertSpy, MESSAGES.remove, act);
    await screen.findByText("I couldn't delete that photo. Want to try again?");
    expect(screen.getByText("Photo 1 of 2")).toBeTruthy();
  });

  it("shares a photo through the phone's share sheet", async () => {
    withTwo();
    await show(<ListingPhotosScreen id="l1" />);
    await open("Photo 1 of 2, Cover");
    await fireEvent.press(button(MESSAGES.shareOne));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    expect(fakeDownloads()).toEqual(["https://files.example/a"]);
  });

  it("removes several selected photos after confirming", async () => {
    const server = startListingsServer({ listings: [aListing({ photos: [aPhoto("a", 0), aPhoto("b", 1), aPhoto("c", 2)] })] });
    await show(<ListingPhotosScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.select }));
    await fireEvent.press(screen.getByRole("button", { name: "Photo 1 of 3, Cover" }));
    await fireEvent.press(screen.getByRole("button", { name: "Photo 3 of 3" }));
    await screen.findByText("2 selected");
    await fireEvent.press(button(MESSAGES.removeSelected));
    expect(alertSpy.mock.calls.at(-1)?.[0]).toBe(removeManyTitle(2));
    await pressAlertButton(alertSpy, MESSAGES.remove, act);
    await screen.findByText(MESSAGES.removedMany);
    expect(writesTo(server, "delete").map((write) => write.url)).toEqual(["/listings/l1/photos/a", "/listings/l1/photos/c"]);
  });

  const selectAll = async () => {
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.select }));
    for (const name of ["Photo 1 of 3, Cover", "Photo 2 of 3", "Photo 3 of 3"]) await fireEvent.press(screen.getByRole("button", { name }));
  };
  const threePhotos = () => startListingsServer({ listings: [aListing({ photos: [aPhoto("a", 0), aPhoto("b", 1), aPhoto("c", 2)] })] });
  const listingReads = (server: ReturnType<typeof startListingsServer>) => server.requests.filter((r) => r.method === "get" && r.url === "/listings/l1").length;

  it("tries every photo when one is already gone, and says they were removed", async () => {
    const server = threePhotos();
    await show(<ListingPhotosScreen id="l1" />);
    await selectAll();
    server.failWrites.push({ match: "/photos/b", status: 404 });
    await fireEvent.press(button(MESSAGES.removeSelected));
    await pressAlertButton(alertSpy, MESSAGES.remove, act);
    await screen.findByText(MESSAGES.removedMany);
    expect(writesTo(server, "delete").map((write) => write.url)).toEqual(["/listings/l1/photos/a", "/listings/l1/photos/b", "/listings/l1/photos/c"]);
    expect(server.listings[0].photos.map((photo) => photo.id)).toEqual(["b"]);
    expect(screen.queryByText(/couldn't remove/)).toBeNull();
  });

  it("keeps going past a photo it can't remove, says exactly how many went, and keeps that one selected", async () => {
    const server = threePhotos();
    await show(<ListingPhotosScreen id="l1" />);
    await selectAll();
    server.failWrites.push({ match: "/photos/b", status: 500 });
    await fireEvent.press(button(MESSAGES.removeSelected));
    await pressAlertButton(alertSpy, MESSAGES.remove, act);
    await screen.findByText("Removed 2 of 3. I couldn't remove the rest. Want to try again?");
    expect(writesTo(server, "delete")).toHaveLength(3);
    expect(server.listings[0].photos.map((photo) => photo.id)).toEqual(["b"]);
    expect(await screen.findByText("1 selected")).toBeTruthy();
  });

  it("reads the listing once for a bulk removal, not once per photo", async () => {
    const server = threePhotos();
    await show(<ListingPhotosScreen id="l1" />);
    await selectAll();
    const before = listingReads(server);
    await fireEvent.press(button(MESSAGES.removeSelected));
    await pressAlertButton(alertSpy, MESSAGES.remove, act);
    await screen.findByText(MESSAGES.removedMany);
    await waitFor(() => expect(listingReads(server)).toBe(before + 1));
  });

});
