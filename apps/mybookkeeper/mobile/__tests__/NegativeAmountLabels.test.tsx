import { render, screen } from "@testing-library/react-native";
import TaxCategoryRowView from "../src/features/tax/TaxCategoryRowView";

describe("a row whose amount is negative", () => {
  it("says minus out loud, as the screen shows a minus sign", async () => {
    await render(<TaxCategoryRowView row={{ category: "repairs", label: "Repairs", cents: -4500, note: null }} />);
    expect(screen.getByText("-$45.00")).toBeTruthy();
    expect(screen.getByLabelText("Repairs, minus 45 dollars")).toBeTruthy();
  });

  it("says nothing extra for a positive amount", async () => {
    await render(<TaxCategoryRowView row={{ category: "repairs", label: "Repairs", cents: 4500, note: null }} />);
    expect(screen.getByLabelText("Repairs, 45 dollars")).toBeTruthy();
  });
});
