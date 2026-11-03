import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import EmptyState from "../components/EmptyState";

describe("EmptyState", () => {
  it("renders the heading and body, with no button when there's no action", async () => {
    await render(<EmptyState body="Add one to get started." heading="No recipes" />);

    expect(screen.getByRole("header", { name: "No recipes" })).toBeTruthy();
    expect(screen.getByText("Add one to get started.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders the icon", async () => {
    await render(<EmptyState body="b" heading="h" icon={<Text>icon</Text>} />);

    expect(screen.getByText("icon")).toBeTruthy();
  });

  it("fires the action and shows loading while it runs", async () => {
    let finish: () => void = () => undefined;
    const work = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const onPress = jest.fn(() => work);
    await render(
      <EmptyState action={{ label: "Add", onPress }} body="b" heading="h" />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Add" }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("loading-button-spinner")).toBeTruthy();
    await act(async () => {
      finish();
      await work;
    });
  });

  it("passes the caller's loading state to the action", async () => {
    await render(
      <EmptyState action={{ label: "Add", onPress: jest.fn(), isLoading: true }} body="b" heading="h" />,
    );

    expect(screen.getByTestId("loading-button-spinner")).toBeTruthy();
  });
});
