import { fireEvent, screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import { Text } from "react-native";
import NotFound from "../app/+not-found";

jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

function Home() {
  return <Text>Recipes home</Text>;
}

describe("a link to a screen the app doesn't have", () => {
  it("says so and takes you back to the recipes", async () => {
    await renderRouter({ index: Home, "+not-found": NotFound }, { initialUrl: "/recipes/does-not-exist-route/nope" });
    expect(screen.getByRole("header", { name: "Page not found" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back to recipes" }));
    expect(await screen.findByText("Recipes home")).toBeTruthy();
  });
});
