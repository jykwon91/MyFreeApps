import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import NotFoundScreen from "../components/NotFoundScreen";

jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

describe("NotFoundScreen", () => {
  beforeEach(() => jest.restoreAllMocks());

  it("says the page isn't there and takes you to the app's home screen", async () => {
    const replace = jest.spyOn(router, "replace").mockImplementation(() => undefined);
    await render(
      <NotFoundScreen
        body="It may have moved or never existed."
        heading="Page not found"
        homeLabel="Back to recipes"
        homeRoute="/"
      />,
    );
    expect(screen.getByRole("header", { name: "Page not found" })).toBeTruthy();
    expect(screen.getByText("It may have moved or never existed.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back to recipes" }));
    expect(replace).toHaveBeenCalledWith("/");
  });
});
