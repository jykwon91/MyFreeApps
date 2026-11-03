import { render, screen } from "@testing-library/react-native";
import DiscoverScreen from "../src/features/placeholders/DiscoverScreen";
import SettingsScreen from "../src/features/placeholders/SettingsScreen";
import { countLabel } from "../src/utils/countLabel";
import { recipeFacts } from "../src/utils/recipeFacts";

describe("placeholder screens", () => {
  it("says Discover isn't here yet, without a date", async () => {
    await render(<DiscoverScreen />);
    expect(screen.getByRole("header", { name: "Discover" })).toBeTruthy();
    expect(screen.getByText(/isn't available in the app yet/)).toBeTruthy();
  });

  it("names Settings", async () => {
    await render(<SettingsScreen />);
    expect(screen.getByRole("header", { name: "Settings" })).toBeTruthy();
  });
});

describe("recipeFacts", () => {
  it("labels what's there and leaves out missing or zero values", () => {
    expect(recipeFacts({ servings: "4", prep_minutes: 15, cook_minutes: 30 })).toEqual([
      { label: "Servings", value: "4" },
      { label: "Prep", value: "15 min" },
      { label: "Cook", value: "30 min" },
    ]);
    expect(recipeFacts({ servings: null, prep_minutes: 0, cook_minutes: null })).toEqual([]);
  });
});

describe("countLabel", () => {
  it("handles singular and plural", () => {
    expect(countLabel(1, "version")).toBe("1 version");
    expect(countLabel(0, "recipe")).toBe("0 recipes");
    expect(countLabel(3, "version")).toBe("3 versions");
  });
});
