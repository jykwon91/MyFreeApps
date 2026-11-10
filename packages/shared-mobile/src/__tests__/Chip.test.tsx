import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import Chip from "../components/Chip";
import { CHIP_HEIGHT } from "../constants/chip";

describe("Chip", () => {
  it("shows its label as text, not as something to press", async () => {
    await render(<Chip label="Interview scheduled" />);

    expect(screen.getByText("Interview scheduled")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is CHIP_HEIGHT tall, so a skeleton standing in for it matches", async () => {
    await render(<Chip label="Applied" />);

    const box = StyleSheet.flatten(screen.getByTestId("chip").props.style);
    const text = StyleSheet.flatten(screen.getByText("Applied").props.style);
    expect(text.lineHeight + box.paddingVertical * 2).toBe(CHIP_HEIGHT);
  });
});
