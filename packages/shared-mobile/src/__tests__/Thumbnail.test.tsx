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
});
