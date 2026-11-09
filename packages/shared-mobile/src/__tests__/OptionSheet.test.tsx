import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { FlatList, Platform, StyleSheet, Text } from "react-native";
import OptionSheet from "../components/OptionSheet";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";

const mockModal: { onDismiss?: () => void } = {};
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, onDismiss, children }: { visible: boolean; onDismiss?: () => void; children: unknown }) => {
    if (onDismiss) mockModal.onDismiss = onDismiss;
    return visible ? children : null;
  },
}));

const OPTIONS = [
  { value: "oak", label: "Oak St" },
  { value: "elm", label: "Elm St" },
];

function sheet(onSelect = jest.fn(), onClose = jest.fn()) {
  return render(
    <OptionSheet isOpen onClose={onClose} onSelect={onSelect} options={OPTIONS} title="Property" value="elm" />,
  );
}

/** Tells every list around the first row that it was laid out, as the screen would. */
async function layOutList(): Promise<void> {
  for (let node = screen.getAllByRole("radio")[0].parent; node; node = node.parent) {
    const onLayout = node.props?.onLayout as ((event: unknown) => void) | undefined;
    await act(async () => onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 1, height: 1 } } }));
  }
}

describe("OptionSheet", () => {
  it("says which option is chosen and reports the one tapped", async () => {
    const onSelect = jest.fn();
    await sheet(onSelect);

    expect(screen.getByRole("radio", { name: "Elm St" }).props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByRole("radio", { name: "Oak St" }).props.accessibilityState).toEqual({ checked: false });

    await fireEvent.press(screen.getByRole("radio", { name: "Oak St" }));
    expect(onSelect).toHaveBeenCalledWith("oak");
  });

  it("opens a long list on the current choice, and not at all when it is first", async () => {
    const scroll = jest.spyOn(FlatList.prototype, "scrollToIndex").mockImplementation(() => undefined);
    const many = Array.from({ length: 30 }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));
    const { rerender } = await render(<OptionSheet isOpen onClose={jest.fn()} onSelect={jest.fn()} options={many} title="Pick" value="v20" />);
    await layOutList();
    expect(scroll).toHaveBeenCalledWith({ index: 20, viewPosition: 0.5, animated: false });
    scroll.mockClear();
    await rerender(<OptionSheet isOpen onClose={jest.fn()} onSelect={jest.fn()} options={many} title="Pick" value="v0" />);
    await layOutList();
    expect(scroll).not.toHaveBeenCalled();
    scroll.mockRestore();
  });

  it("closes, with rows and a Close button big enough to tap", async () => {
    const onClose = jest.fn();
    await sheet(jest.fn(), onClose);

    const close = screen.getByRole("button", { name: "Close" });
    expect(StyleSheet.flatten(close.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    const row = StyleSheet.flatten(screen.getByRole("radio", { name: "Oak St" }).props.style);
    expect(row.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

    await fireEvent.press(close);
    expect(onClose).toHaveBeenCalled();
  });

  it("says so when there is nothing to choose", async () => {
    await render(
      <OptionSheet emptyText="Add a property on the website first." isOpen onClose={jest.fn()} onSelect={jest.fn()} options={[]} title="Property" value={null} />,
    );
    expect(screen.getByText("Add a property on the website first.")).toBeTruthy();
  });

  it("shows the given content in place of the empty text while the options aren't there yet", async () => {
    await render(
      <OptionSheet emptyContent={<Text>Still loading</Text>} emptyText="Nothing here." isOpen onClose={jest.fn()} onSelect={jest.fn()} options={[]} title="Property" value={null} />,
    );
    expect(screen.getByText("Still loading")).toBeTruthy();
    expect(screen.queryByText("Nothing here.")).toBeNull();
  });

  describe("onClosed", () => {
    const openOrClosed = (isOpen: boolean, onClosed: () => void) => (
      <OptionSheet isOpen={isOpen} onClose={jest.fn()} onClosed={onClosed} onSelect={jest.fn()} options={OPTIONS} title="Property" value="elm" />
    );

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("waits for the Modal to say it's gone on iOS", async () => {
      jest.replaceProperty(Platform, "OS", "ios");
      const onClosed = jest.fn();
      const { rerender } = await render(openOrClosed(true, onClosed));
      await rerender(openOrClosed(false, onClosed));
      expect(onClosed).not.toHaveBeenCalled();
      mockModal.onDismiss?.();
      expect(onClosed).toHaveBeenCalledTimes(1);
    });

    it("fires as soon as it closes on Android, which has no such signal", async () => {
      jest.replaceProperty(Platform, "OS", "android");
      const onClosed = jest.fn();
      const { rerender } = await render(openOrClosed(true, onClosed));
      expect(onClosed).not.toHaveBeenCalled();
      await rerender(openOrClosed(false, onClosed));
      expect(onClosed).toHaveBeenCalledTimes(1);
    });
  });
});
