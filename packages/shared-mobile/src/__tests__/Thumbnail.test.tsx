import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import Thumbnail from "../components/Thumbnail";

describe("Thumbnail", () => {
  it("downsamples to the view size and keeps the size, source and accessibility props it is given", async () => {
    await render(<Thumbnail accessibilityLabel="Kitchen" source={{ uri: "file:///kitchen.jpg" }} style={{ width: 40, height: 40 }} testID="thumb" />);

    const image = screen.getByTestId("thumb");
    expect(image.props.resizeMethod).toBe("resize");
    expect(image.props.source).toEqual({ uri: "file:///kitchen.jpg" });
    expect(image.props.accessibilityLabel).toBe("Kitchen");
    expect(StyleSheet.flatten(image.props.style)).toMatchObject({ width: 40, height: 40 });
  });

  it("cannot be switched back to a full-size decode", async () => {
    // @ts-expect-error resizeMethod is not a Thumbnail prop
    await render(<Thumbnail resizeMethod="scale" source={{ uri: "file:///a.jpg" }} testID="thumb" />);

    expect(screen.getByTestId("thumb").props.resizeMethod).toBe("resize");
  });

  it("makes a labelled photo an accessibility element so VoiceOver reads the label", async () => {
    await render(<Thumbnail accessibilityLabel="Kitchen" source={{ uri: "file:///kitchen.jpg" }} testID="thumb" />);

    const image = screen.getByTestId("thumb");
    expect(image.props.accessible).toBe(true);
    expect(image.props.accessibilityRole).toBe("image");
    expect(image.props.accessibilityLabel).toBe("Kitchen");
  });

  it("leaves an unlabelled photo out of the accessibility tree", async () => {
    await render(<Thumbnail source={{ uri: "file:///kitchen.jpg" }} testID="thumb" />);

    expect(screen.getByTestId("thumb").props.accessible).toBe(false);
  });

  it("lets the caller override accessible", async () => {
    await render(<Thumbnail accessibilityLabel="Kitchen" accessible={false} source={{ uri: "file:///a.jpg" }} testID="thumb" />);

    expect(screen.getByTestId("thumb").props.accessible).toBe(false);
  });

  describe("when the photo can't load", () => {
    const source = { uri: "https://files.example/kitchen.jpg?sig=old" };

    it("keeps showing the photo, and still calls the caller's onError, when no failed message is given", async () => {
      const onError = jest.fn();
      await render(<Thumbnail onError={onError} source={source} testID="thumb" />);

      await fireEvent(screen.getByTestId("thumb"), "error", { nativeEvent: { error: "offline" } });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("thumb").props.source).toEqual(source);
    });

    it("turns into a readable tile that VoiceOver reads as the failure, not as a photo", async () => {
      await render(<Thumbnail accessibilityLabel="Kitchen" failedMessage="Photo couldn't load" source={source} style={{ width: 80, height: 80 }} testID="thumb" />);

      await fireEvent(screen.getByTestId("thumb"), "error", { nativeEvent: { error: "offline" } });

      expect(screen.getByText("Photo couldn't load")).toBeTruthy();
      const tile = screen.getByTestId("thumb");
      expect(tile.props.accessibilityLabel).toBe("Photo couldn't load");
      expect(tile.props.accessibilityRole).not.toBe("image");
      expect(screen.queryByText("Tap to try again")).toBeNull();
    });

    it("offers a retry that asks the screen for fresh links and tries the photo again", async () => {
      const onRetry = jest.fn();
      const onFailedChange = jest.fn();
      await render(<Thumbnail failedMessage="Photo couldn't load" onFailedChange={onFailedChange} onRetry={onRetry} source={source} testID="thumb" />);

      await fireEvent(screen.getByTestId("thumb"), "error", { nativeEvent: { error: "expired" } });
      expect(onFailedChange).toHaveBeenLastCalledWith(true);
      expect(screen.getByRole("button").props.accessibilityLabel).toBe("Photo couldn't load");
      await fireEvent.press(screen.getByRole("button"));

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onFailedChange).toHaveBeenLastCalledWith(false);
      expect(screen.getByTestId("thumb").props.source).toEqual(source);
      expect(screen.queryByText("Photo couldn't load")).toBeNull();
    });

    it("tries again by itself when it is given a fresh link", async () => {
      const { rerender } = await render(<Thumbnail failedMessage="Photo couldn't load" source={source} testID="thumb" />);
      await fireEvent(screen.getByTestId("thumb"), "error", { nativeEvent: { error: "expired" } });
      expect(screen.getByText("Photo couldn't load")).toBeTruthy();

      await rerender(<Thumbnail failedMessage="Photo couldn't load" source={{ uri: "https://files.example/kitchen.jpg?sig=new" }} testID="thumb" />);

      expect(screen.queryByText("Photo couldn't load")).toBeNull();
      expect(screen.getByTestId("thumb").props.source).toEqual({ uri: "https://files.example/kitchen.jpg?sig=new" });
    });

    it("leaves the words out of a box too small for them but still labels it", async () => {
      await render(<Thumbnail failedMessage="Photo couldn't load" hideFailedText source={source} testID="thumb" />);

      await fireEvent(screen.getByTestId("thumb"), "error", { nativeEvent: { error: "offline" } });

      expect(screen.queryByText("Photo couldn't load")).toBeNull();
      expect(screen.getByTestId("thumb").props.accessibilityLabel).toBe("Photo couldn't load");
    });
  });
});
