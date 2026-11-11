import { render, screen } from "@testing-library/react-native";
import { StyleSheet, useColorScheme } from "react-native";
import Chip from "../components/Chip";
import { CHIP_HEIGHT } from "../constants/chip";
import { darkColors, lightColors } from "../theme/colors";
import { darkToneColors, lightToneColors } from "../theme/toneColors";
import type { ChipTone } from "../types/ChipTone";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const COLORED_TONES = Object.keys(lightToneColors) as Exclude<ChipTone, "neutral">[];

function chipColors(label: string) {
  return {
    box: StyleSheet.flatten(screen.getByTestId("chip").props.style).backgroundColor,
    text: StyleSheet.flatten(screen.getByText(label).props.style).color,
  };
}

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

  describe.each([
    ["light", lightColors, lightToneColors],
    ["dark", darkColors, darkToneColors],
  ])("in the %s theme", (scheme, colors, tones) => {
    beforeEach(() => {
      jest.mocked(useColorScheme).mockReturnValue(scheme as ReturnType<typeof useColorScheme>);
    });

    it("is the plain muted chip with no tone", async () => {
      await render(<Chip label="Applied" />);

      expect(chipColors("Applied")).toEqual({ box: colors.muted, text: colors.foreground });
    });

    it("is the same plain chip for the neutral tone", async () => {
      await render(<Chip label="Applied" tone="neutral" />);

      expect(chipColors("Applied")).toEqual({ box: colors.muted, text: colors.foreground });
    });

    it.each(COLORED_TONES)("paints the %s tone from its own colours and keeps the label", async (tone) => {
      await render(<Chip label="Offer received" tone={tone} />);

      expect(chipColors("Offer received")).toEqual({ box: tones[tone].background, text: tones[tone].foreground });
    });
  });
});
