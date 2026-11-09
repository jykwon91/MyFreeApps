import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import FormSheet from "../components/FormSheet";

async function setup(props: { isOpen?: boolean; failure?: string | null } = {}) {
  const onRequestClose = jest.fn();
  await render(
    <FormSheet failure={props.failure} isOpen={props.isOpen ?? true} onRequestClose={onRequestClose} title="Add a charge">
      <Text>Amount field</Text>
    </FormSheet>,
  );
  return { onRequestClose };
}

describe("FormSheet", () => {
  it("shows its title as a header, with the fields under it", async () => {
    await setup();
    expect(screen.getByRole("header", { name: "Add a charge" })).toBeTruthy();
    expect(screen.getByText("Amount field")).toBeTruthy();
  });

  it("shows nothing while closed", async () => {
    await setup({ isOpen: false });
    expect(screen.queryByText("Add a charge")).toBeNull();
  });

  it("shows a failure as an alert at the top", async () => {
    await setup({ failure: "I couldn't save that." });
    expect(screen.getByRole("alert")).toHaveTextContent("I couldn't save that.");
  });

  it("shows no alert when nothing went wrong", async () => {
    await setup();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("hands the system's dismiss to its owner instead of closing itself", async () => {
    const { onRequestClose } = await setup();
    await fireEvent(screen.getByText("Amount field"), "requestClose");
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Amount field")).toBeTruthy();
  });
});
