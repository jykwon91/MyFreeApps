import { fireEvent, render, screen } from "@testing-library/react-native";
import ListingPhotoViewer from "../src/features/listings/ListingPhotoViewer";
import WelcomeManualPhotoViewer from "../src/features/welcomeManuals/WelcomeManualPhotoViewer";
import { show } from "../test-support/listingsHarness";
import { aPhoto } from "../test-support/listingsServer";
import { anImage } from "../test-support/aWelcomeManual";

jest.mock("expo-status-bar", () => ({ StatusBar: jest.fn(() => null) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

// VoiceOver sends the two-finger scrub to the focused element, and it goes up until a view handles it.
describe("the photo viewers close on the screen reader's escape gesture", () => {
  it("the listing photo viewer", async () => {
    const onClose = jest.fn();
    await show(
      <ListingPhotoViewer canWrite={false} failure={null} index={0} isBusy={false} onClose={onClose} onIndexChange={jest.fn()} onMove={jest.fn()} onRemove={jest.fn()} onRetryPhoto={jest.fn()} photos={[aPhoto("a", 0), aPhoto("b", 1)]} />,
    );
    await fireEvent(await screen.findByText("Photo 1 of 2"), "accessibilityEscape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the welcome manual photo viewer", async () => {
    const onClose = jest.fn();
    await render(<WelcomeManualPhotoViewer images={[anImage({ id: "a", caption: "The router" })]} onClose={onClose} startIndex={0} />);
    await fireEvent(screen.getByText("1 of 1"), "accessibilityEscape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
