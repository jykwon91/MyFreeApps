import "@platform/mobile/test-support/reactNativeFormData";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { LISTING_PHOTO_MESSAGES as MESSAGES } from "../src/constants/listingPhotos";
import ListingPhotosScreen from "../src/features/listings/ListingPhotosScreen";
import { aListing, aPhoto, startListingsServer } from "../test-support/listingsServer";
import { restoreApi, show, signInToWorkspace } from "../test-support/listingsHarness";

jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-router", () => jest.requireActual("../test-support/listingsHarness").expoRouterMock());
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn(), launchCameraAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

beforeEach(() => {
  signInToWorkspace();
});
afterEach(restoreApi);

const failToLoad = (image: Parameters<typeof fireEvent>[0]) => fireEvent(image, "error", { nativeEvent: { error: "offline" } });
const listingReads = (server: ReturnType<typeof startListingsServer>) => server.requests.filter((request) => request.method === "get" && request.url?.endsWith("/listings/l1")).length;

describe("a listing photo that can't load", () => {
  it("says so in the tile, to VoiceOver too, instead of staying a blank box", async () => {
    startListingsServer({ listings: [aListing({ photos: [aPhoto("a", 0)] })] });
    await show(<ListingPhotosScreen id="l1" />);
    await screen.findByRole("button", { name: "Photo 1 of 1, Cover" });

    await failToLoad(screen.getByTestId("listing-photo-image"));

    expect(screen.getByText(MESSAGES.couldntLoad)).toBeTruthy();
    expect(screen.getByRole("button", { name: `Photo 1 of 1, Cover, ${MESSAGES.couldntLoad}` })).toBeTruthy();
  });

  it("offers a retry in the viewer that reads the listing again for fresh links", async () => {
    const server = startListingsServer({ listings: [aListing({ photos: [aPhoto("a", 0)] })] });
    await show(<ListingPhotosScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Photo 1 of 1, Cover" }));
    await screen.findByText("Photo 1 of 1");
    await failToLoad(screen.getByLabelText("Photo 1 of 1"));
    const before = listingReads(server);

    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.couldntLoad }));

    await waitFor(() => expect(listingReads(server)).toBeGreaterThan(before));
    expect(screen.queryByText(MESSAGES.couldntLoad)).toBeNull();
  });
});
