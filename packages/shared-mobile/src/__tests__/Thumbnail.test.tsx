import { render, screen } from "@testing-library/react-native";
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
});
