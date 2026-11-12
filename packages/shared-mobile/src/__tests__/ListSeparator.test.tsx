import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import ListSeparator from "../components/ListSeparator";
import { spacing } from "../theme/spacing";

describe("ListSeparator", () => {
  it("leaves the theme's medium gap between cards", async () => {
    await render(<ListSeparator />);

    expect(StyleSheet.flatten(screen.getByTestId("list-separator").props.style).height).toBe(spacing.md);
  });
});
