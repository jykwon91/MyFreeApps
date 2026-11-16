import { render, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import ListRowTitle from "../components/ListRowTitle";
import { setFontScale } from "../../test-support/fontScale";

function layout() {
  return StyleSheet.flatten(screen.getByTestId("list-row-title").props.style);
}

describe("ListRowTitle", () => {
  describe("at the default text size", () => {
    it("keeps the name to one line beside the amount", async () => {
      await render(<ListRowTitle aside={<Text>$1,250.00</Text>} title="Home Depot hardware and supplies" />);

      expect(layout().flexDirection).toBe("row");
      expect(screen.getByText("Home Depot hardware and supplies").props.numberOfLines).toBe(1);
      expect(StyleSheet.flatten(screen.getByTestId("list-row-title-aside").props.style).flexWrap).toBe("nowrap");
      expect(StyleSheet.flatten(screen.getByText("Home Depot hardware and supplies").props.style)).toMatchObject({ flex: 1, fontWeight: "600" });
    });

    it("uses the line count and ellipsis it is given", async () => {
      await render(<ListRowTitle ellipsizeMode="middle" largeTextNumberOfLines={3} numberOfLines={2} title="lease-2026.pdf" weight="regular" />);

      const title = screen.getByText("lease-2026.pdf");
      expect(title.props.numberOfLines).toBe(2);
      expect(title.props.ellipsizeMode).toBe("middle");
      expect(StyleSheet.flatten(title.props.style).fontWeight).toBe("normal");
    });
  });

  describe("at a large text size", () => {
    beforeEach(() => setFontScale(2));

    it("gives the name its own lines and puts the amount below it", async () => {
      await render(<ListRowTitle aside={<Text>$1,250.00</Text>} title="Home Depot hardware and supplies" />);

      expect(layout().flexDirection).toBeUndefined();
      const title = screen.getByText("Home Depot hardware and supplies");
      expect(title.props.numberOfLines).toBeUndefined();
      expect(StyleSheet.flatten(title.props.style).flex).toBeUndefined();
      expect(screen.getByText("$1,250.00")).toBeTruthy();
    });

    it("wraps several asides below the name", async () => {
      await render(
        <ListRowTitle
          aside={
            <>
              <Text>Reference</Text>
              <Text>Failed</Text>
            </>
          }
          title="statement.pdf"
        />,
      );

      const asideRow = StyleSheet.flatten(screen.getByTestId("list-row-title-aside").props.style);
      expect(asideRow).toMatchObject({ flexDirection: "row", flexWrap: "wrap" });
    });

    it("keeps a tick box beside the name", async () => {
      await render(<ListRowTitle leading={<Text>☐</Text>} title="Rent" />);

      expect(StyleSheet.flatten(screen.getByText("Rent").props.style).flex).toBe(1);
    });

    it("holds a file name to the large-text line count it is given", async () => {
      await render(<ListRowTitle largeTextNumberOfLines={3} title="lease-2026.pdf" />);

      expect(screen.getByText("lease-2026.pdf").props.numberOfLines).toBe(3);
    });
  });
});
