import "@platform/mobile/test-support/reactNativeFormData";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as Sharing from "expo-sharing";
import { LISTING_PHOTO_MESSAGES as MESSAGES } from "../src/constants/listingPhotos";
import ListingPhotosScreen from "../src/features/listings/ListingPhotosScreen";
import { fakeDownloads, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { aListing, aPhoto, startListingsServer } from "../test-support/listingsServer";
import { restoreApi, show, signInToWorkspace } from "../test-support/listingsHarness";
import { SHOWN } from "@platform/mobile/test-support/shown";

jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-router", () => jest.requireActual("../test-support/listingsHarness").expoRouterMock());
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn(), launchCameraAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

beforeEach(() => {
  jest.clearAllMocks();
  signInToWorkspace();
  resetFakeFiles();
});
afterEach(restoreApi);

const button = (name: string) => screen.getByRole("button", { name });
const threePhotos = (role?: "viewer") =>
  startListingsServer({ role, listings: [aListing({ photos: [aPhoto("a", 0), aPhoto("b", 1), aPhoto("c", 2)] })] });

async function selectTwo(): Promise<void> {
  await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.select }));
  await fireEvent.press(screen.getByRole("button", { name: "Photo 1 of 3, Cover" }));
  await fireEvent.press(screen.getByRole("button", { name: "Photo 3 of 3" }));
  await screen.findByText("2 selected");
}

let release: () => void = () => undefined;

describe("sharing several listing photos", () => {
  it("lets a viewer select photos and share them, without a way to remove", async () => {
    threePhotos("viewer");
    await show(<ListingPhotosScreen id="l1" />);
    await selectTwo();
    expect(button(MESSAGES.shareSelected)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.removeSelected })).toBeNull();
    expect(screen.queryByRole("button", { name: MESSAGES.add })).toBeNull();
  });

  it("keeps Remove selected for people who can edit", async () => {
    threePhotos();
    await show(<ListingPhotosScreen id="l1" />);
    await selectTwo();
    expect(button(MESSAGES.removeSelected)).toBeTruthy();
    expect(button(MESSAGES.shareSelected)).toBeTruthy();
  });

  it("downloads and shares every selected photo", async () => {
    threePhotos("viewer");
    await show(<ListingPhotosScreen id="l1" />);
    await selectTwo();
    await fireEvent.press(button(MESSAGES.shareSelected));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(2));
    expect(fakeDownloads()).toEqual(["https://files.example/a", "https://files.example/c"]);
    const shared = jest.mocked(Sharing.shareAsync).mock.calls.map(([uri]) => uri);
    expect(shared[0]).toMatch(/\/a\.jpg$/);
    expect(shared[1]).toMatch(/\/c\.jpg$/);
  });

  it("disables the button and labels it while the photos download", async () => {
    threePhotos("viewer");
    const gate = new Promise<void>((resolve) => { release = resolve; });
    jest.mocked(Sharing.shareAsync).mockImplementation(() => gate);
    await show(<ListingPhotosScreen id="l1" />);
    await selectTwo();
    await fireEvent.press(button(MESSAGES.shareSelected));
    const busy = await screen.findByRole("button", { name: MESSAGES.sharing });
    expect(busy.props.accessibilityState?.disabled).toBe(true);
    release();
    await waitFor(() => expect(screen.queryByRole("button", { name: MESSAGES.sharing })).toBeNull());
  });

  it("shows a toast when the photos can't be shared", async () => {
    threePhotos("viewer");
    jest.mocked(Sharing.shareAsync).mockRejectedValue(new Error("no"));
    await show(<ListingPhotosScreen id="l1" />);
    await selectTwo();
    await fireEvent.press(button(MESSAGES.shareSelected));
    expect(await screen.findByText(MESSAGES.shareManyFailed, SHOWN)).toBeTruthy();
    expect(button(MESSAGES.shareSelected)).toBeTruthy();
  });
});
