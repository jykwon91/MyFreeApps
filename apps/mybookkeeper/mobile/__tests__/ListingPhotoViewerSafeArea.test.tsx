import { screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import ListingPhotoViewer from "../src/features/listings/ListingPhotoViewer";
import { aPhoto } from "../test-support/listingsServer";
import { show } from "../test-support/listingsHarness";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

describe("the listing photo viewer", () => {
  it("keeps its header and Close button clear of the status bar and home indicator", async () => {
    await show(
      <ListingPhotoViewer canWrite={false} failure={null} index={0} isBusy={false} onClose={jest.fn()} onIndexChange={jest.fn()} onMove={jest.fn()} onRemove={jest.fn()} onRetryPhoto={jest.fn()} photos={[aPhoto("a", 0), aPhoto("b", 1)]} />,
    );
    await screen.findByText("Photo 1 of 2");
    const content = StyleSheet.flatten(screen.getByTestId("listing-photo-viewer").props.contentContainerStyle);
    expect(content.paddingTop).toBeGreaterThanOrEqual(47);
    expect(content.paddingBottom).toBeGreaterThanOrEqual(34);
  });
});
