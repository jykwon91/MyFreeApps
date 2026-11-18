import { screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import CookRoute from "../app/recipes/[id]/cook";
import { INVALID_LINK_MESSAGES } from "../src/constants/invalidLink";

const mockCookScreen = jest.fn();

jest.mock("../src/features/cook/CookScreen", () => ({
  __esModule: true,
  default: () => {
    mockCookScreen();
    return null;
  },
}));

const RECIPE_ID = "3f2b8c1e-9d4a-4e7b-8a6f-1c2d3e4f5a6b";

beforeEach(() => jest.clearAllMocks());

describe("cook route", () => {
  it("says it can't find the recipe for an id that isn't a recipe id, without asking the API", async () => {
    await renderRouter({ "recipes/[id]/cook": CookRoute }, { initialUrl: "/recipes/abc/cook" });
    expect(screen.getByRole("header", { name: INVALID_LINK_MESSAGES.heading })).toBeTruthy();
    expect(mockCookScreen).not.toHaveBeenCalled();
  });

  it("opens cooking for a real id", async () => {
    await renderRouter({ "recipes/[id]/cook": CookRoute }, { initialUrl: `/recipes/${RECIPE_ID}/cook` });
    expect(mockCookScreen).toHaveBeenCalledTimes(1);
  });
});
