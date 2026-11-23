import { render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import ListingPhotoViewer from "../src/features/listings/ListingPhotoViewer";
import WelcomeManualPhotoViewer from "../src/features/welcomeManuals/WelcomeManualPhotoViewer";
import { show } from "../test-support/listingsHarness";
import { aPhoto } from "../test-support/listingsServer";
import { anImage } from "../test-support/aWelcomeManual";

const mockModalAnimations: (string | undefined)[] = [];
jest.mock("expo-status-bar", () => ({ StatusBar: jest.fn(() => null) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ animationType, visible, children }: { animationType?: string; visible: boolean; children: unknown }) => {
    mockModalAnimations.push(animationType);
    return visible ? children : null;
  },
}));

function setReduceMotion(isOn: boolean): void {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(isOn);
  jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((() => ({ remove: jest.fn() })) as never);
}

const lastAnimation = () => mockModalAnimations.at(-1);

beforeEach(() => {
  mockModalAnimations.length = 0;
});

describe.each([
  [true, "none", "none"],
  [false, "slide", "fade"],
])("the photo viewers with Reduce Motion %s", (reduceMotion, listingAnimation, manualAnimation) => {
  beforeEach(() => setReduceMotion(reduceMotion));

  it(`the listing photo viewer uses "${listingAnimation}"`, async () => {
    await show(
      <ListingPhotoViewer canWrite={false} failure={null} index={0} isBusy={false} onClose={jest.fn()} onIndexChange={jest.fn()} onMove={jest.fn()} onRemove={jest.fn()} onRetryPhoto={jest.fn()} photos={[aPhoto("a", 0), aPhoto("b", 1)]} />,
    );
    await screen.findByText("Photo 1 of 2");
    await waitFor(() => expect(lastAnimation()).toBe(listingAnimation));
  });

  it(`the welcome manual photo viewer uses "${manualAnimation}"`, async () => {
    await render(<WelcomeManualPhotoViewer images={[anImage({ id: "a", caption: "The router" })]} onClose={jest.fn()} startIndex={0} />);
    await waitFor(() => expect(lastAnimation()).toBe(manualAnimation));
  });
});
