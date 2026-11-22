import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import CollapsibleHeader from "../components/CollapsibleHeader";

function renderHeader(isOpen: boolean, onToggle: () => void) {
  return render(
    <CollapsibleHeader
      action={<Text>{isOpen ? "Hide" : "Show"}</Text>}
      actionLabel="Notes, a preview"
      aside={<Text>3</Text>}
      headingLabel="Notes, 3 items"
      isOpen={isOpen}
      onToggle={onToggle}
      title="Notes"
    />,
  );
}

describe("CollapsibleHeader", () => {
  it("is a heading and, separately, a button that says whether it is open", async () => {
    await renderHeader(false, jest.fn());

    expect(screen.getByRole("header", { name: "Notes, 3 items" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Notes, a preview", expanded: false })).toBeTruthy();
  });

  it("opens and closes from the button", async () => {
    const onToggle = jest.fn();
    await renderHeader(true, onToggle);

    await fireEvent.press(screen.getByRole("button", { name: "Notes, a preview", expanded: true }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("keeps the sighted-only count out of the reader's way", async () => {
    await renderHeader(false, jest.fn());

    expect(screen.queryByText("3")).toBeNull();
  });
});
