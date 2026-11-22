import { fireEvent, render, screen } from "@testing-library/react-native";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../src/constants/moneyAnalysis";
import MoreWaysToLook from "../src/features/moneyAnalysis/MoreWaysToLook";

const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({ router: { navigate: (path: string) => mockNavigate(path), push: jest.fn() } }));

describe("MoreWaysToLook", () => {
  it("links to Rental ROI", async () => {
    await render(<MoreWaysToLook />);
    await fireEvent.press(screen.getByText(MESSAGES.rentalRoi));
    expect(mockNavigate).toHaveBeenCalledWith("/analytics/rental-roi");
  });
});
