import { fireEvent, render, screen } from "@testing-library/react-native";
import { StatusBar } from "expo-status-bar";
import { AccessibilityInfo, Dimensions } from "react-native";
import { WELCOME_MANUAL_PHOTO_VIEWER_MESSAGES as MESSAGES, pageAtOffset, photoViewerCounter } from "../src/constants/welcomeManualPhotoViewer";
import WelcomeManualPhotoViewer from "../src/features/welcomeManuals/WelcomeManualPhotoViewer";
import { isInsideAccessibleElement } from "../test-support/isInsideAccessibleElement";
import { anImage } from "../test-support/aWelcomeManual";

jest.mock("expo-status-bar", () => ({ StatusBar: jest.fn(() => null) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const images = [
  anImage({ id: "a", caption: "The router" }),
  anImage({ id: "b", caption: null, display_order: 1 }),
  anImage({ id: "c", caption: "The thermostat", display_order: 2 }),
];
const width = Dimensions.get("window").width;
const open = async (startIndex: number, onClose = jest.fn()) => {
  await render(<WelcomeManualPhotoViewer images={images} onClose={onClose} startIndex={startIndex} />);
  return onClose;
};
const button = (name: string) => screen.getByRole("button", { name });

describe("the photo viewer", () => {
  it("keeps the status bar icons light over its black backdrop", async () => {
    await open(0);
    expect(jest.mocked(StatusBar).mock.calls.some(([props]) => props.style === "light")).toBe(true);
  });

  it("opens at the photo that was tapped, with its position", async () => {
    await open(1);
    expect(screen.getByText(photoViewerCounter(1, 3))).toBeTruthy();
    expect(screen.getByLabelText("Photo 2 of 3")).toBeTruthy();
    expect(screen.getByText(MESSAGES.noCaption)).toBeTruthy();
  });

  it("shows a caption and labels the page with it", async () => {
    await open(0);
    expect(screen.getByText("The router")).toBeTruthy();
    expect(screen.getByLabelText("Photo 1 of 3, The router")).toBeTruthy();
  });

  it("pages with the next and previous buttons", async () => {
    await open(0);
    await fireEvent.press(button(MESSAGES.next));
    expect(screen.getByText("2 of 3")).toBeTruthy();
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenCalledWith("2 of 3", { queue: true });
    await fireEvent.press(button(MESSAGES.next));
    expect(screen.getByText("3 of 3")).toBeTruthy();
    await fireEvent.press(button(MESSAGES.previous));
    expect(screen.getByText("2 of 3")).toBeTruthy();
  });

  it("keeps Previous and Next on screen, disabled at the ends, so screen reader focus stays put", async () => {
    await open(0);
    expect(button(MESSAGES.previous)).toBeDisabled();
    expect(button(MESSAGES.previous).props.accessibilityState).toMatchObject({ disabled: true });
    expect(button(MESSAGES.next)).toBeEnabled();
    await fireEvent.press(button(MESSAGES.next));
    await fireEvent.press(button(MESSAGES.next));
    expect(screen.getByText("3 of 3")).toBeTruthy();
    expect(button(MESSAGES.next)).toBeDisabled();
    expect(button(MESSAGES.next).props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(button(MESSAGES.previous));
    expect(button(MESSAGES.next)).toBeEnabled();
  });

  it("follows a swipe", async () => {
    await open(0);
    await fireEvent(screen.getByTestId("welcome-manual-photo-pager"), "momentumScrollEnd", { nativeEvent: { contentOffset: { x: width * 2, y: 0 } } });
    expect(screen.getByText("3 of 3")).toBeTruthy();
    await fireEvent(screen.getByTestId("welcome-manual-photo-pager"), "momentumScrollEnd", { nativeEvent: { contentOffset: { x: width, y: 0 } } });
    expect(screen.getByText("2 of 3")).toBeTruthy();
  });

  it("closes from the close button and from the Android back button", async () => {
    const onClose = await open(0);
    await fireEvent.press(button(MESSAGES.close));
    expect(onClose).toHaveBeenCalledTimes(1);
    await fireEvent(screen.getByTestId("welcome-manual-photo-viewer"), "requestClose");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("offers Edit for the photo on screen only when given a way to edit", async () => {
    const onEdit = jest.fn();
    await render(<WelcomeManualPhotoViewer images={images} onClose={jest.fn()} onEdit={onEdit} startIndex={2} />);
    await fireEvent.press(button("Edit photo 3 of 3"));
    expect(onEdit).toHaveBeenCalledWith(images[2]);
  });

  it("has no Edit button without one", async () => {
    await open(0);
    expect(screen.queryByRole("button", { name: /^Edit photo/ })).toBeNull();
  });

  it("keeps a scroll offset inside the photos there are", () => {
    expect(pageAtOffset(-50, 400, 3)).toBe(0);
    expect(pageAtOffset(9999, 400, 3)).toBe(2);
    expect(pageAtOffset(10, 0, 3)).toBe(0);
  });

  it("says a photo couldn't load, and asks for fresh links when tapped to retry", async () => {
    const onRetry = jest.fn();
    await render(<WelcomeManualPhotoViewer images={images} onClose={jest.fn()} onRetry={onRetry} startIndex={0} />);
    await fireEvent(screen.getAllByTestId("welcome-manual-photo-image")[0], "error", { nativeEvent: { error: "expired" } });
    expect(screen.getByText(MESSAGES.couldntLoad)).toBeTruthy();
    await fireEvent.press(button(MESSAGES.couldntLoad));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps the retry button of a failed photo reachable, and says in the page label that it failed", async () => {
    await render(<WelcomeManualPhotoViewer images={images} onClose={jest.fn()} onRetry={jest.fn()} startIndex={0} />);
    await fireEvent(screen.getAllByTestId("welcome-manual-photo-image")[0], "error", { nativeEvent: { error: "expired" } });

    expect(isInsideAccessibleElement(button(MESSAGES.couldntLoad))).toBe(false);
    expect(screen.getByLabelText(`Photo 1 of 3, The router, ${MESSAGES.couldntLoad}`)).toBeTruthy();
  });
});
