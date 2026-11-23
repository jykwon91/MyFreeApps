import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Alert, type AlertButton, Text, TextInput } from "react-native";
import FormSheet from "../components/FormSheet";
import FormSheetCancelButton from "../components/FormSheetCancelButton";
import LoadingButton from "../components/LoadingButton";
import { DISCARD_MESSAGES } from "@platform/core/constants/discard";
import { FORM_SHEET_TEST_ID } from "../constants/formSheet";
import { SHEET_MODAL_ROOT_TEST_ID } from "../constants/sheetModal";

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

function lastAlertButton(label: string): AlertButton {
  const button = alert.mock.calls.at(-1)?.[2]?.find((candidate) => candidate.text === label);
  if (!button) throw new Error(`No "${label}" button on the last alert`);
  return button;
}

async function setup(props: { isOpen?: boolean; failure?: string | null } = {}) {
  const onRequestClose = jest.fn();
  await render(
    <FormSheet failure={props.failure} isOpen={props.isOpen ?? true} onRequestClose={onRequestClose} title="Add a charge">
      <Text>Amount field</Text>
    </FormSheet>,
  );
  return { onRequestClose };
}

/** A sheet the way its owners use it: what's typed is unsaved until Save, which closes it straight away. */
function NoteSheet({ isBusy = false }: { isBusy?: boolean }) {
  const [isOpen, setIsOpen] = useState(true);
  const [note, setNote] = useState("");
  if (!isOpen) return <Text>sheet closed</Text>;
  return (
    <FormSheet hasUnsavedChanges={note !== ""} isBusy={isBusy} isOpen onRequestClose={() => setIsOpen(false)} title="Add a note">
      <TextInput accessibilityLabel="Note" onChangeText={setNote} value={note} />
      <LoadingButton onPress={() => setIsOpen(false)}>Save</LoadingButton>
      <FormSheetCancelButton>Cancel</FormSheetCancelButton>
    </FormSheet>
  );
}

beforeEach(() => alert.mockClear());

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
    await fireEvent(screen.getByTestId(FORM_SHEET_TEST_ID), "requestClose");
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Amount field")).toBeTruthy();
  });
});

describe("FormSheet closing with unsaved changes", () => {
  it("closes on Back straight away when nothing was typed", async () => {
    await render(<NoteSheet />);
    await fireEvent(screen.getByTestId(FORM_SHEET_TEST_ID), "requestClose");
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByText("sheet closed")).toBeTruthy();
  });

  it("closes on Cancel straight away when nothing was typed", async () => {
    await render(<NoteSheet />);
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByText("sheet closed")).toBeTruthy();
  });

  it("asks on Back once something is typed, and stays open on Keep editing", async () => {
    await render(<NoteSheet />);
    await fireEvent.changeText(screen.getByLabelText("Note"), "Leaky tap");
    await fireEvent(screen.getByTestId(FORM_SHEET_TEST_ID), "requestClose");
    expect(alert).toHaveBeenCalledWith(DISCARD_MESSAGES.discardTitle, DISCARD_MESSAGES.discardBody, [
      { text: DISCARD_MESSAGES.keepEditing, style: "cancel" },
      { text: DISCARD_MESSAGES.discard, style: "destructive", onPress: expect.any(Function) },
    ]);
    expect(lastAlertButton(DISCARD_MESSAGES.keepEditing).onPress).toBeUndefined();
    expect(screen.getByDisplayValue("Leaky tap")).toBeTruthy();
  });

  it("closes on Discard after Back", async () => {
    await render(<NoteSheet />);
    await fireEvent.changeText(screen.getByLabelText("Note"), "Leaky tap");
    await fireEvent(screen.getByTestId(FORM_SHEET_TEST_ID), "requestClose");
    await act(async () => lastAlertButton(DISCARD_MESSAGES.discard).onPress?.());
    expect(screen.getByText("sheet closed")).toBeTruthy();
  });

  it("asks the same question on Cancel, and closes on Discard", async () => {
    await render(<NoteSheet />);
    await fireEvent.changeText(screen.getByLabelText("Note"), "Leaky tap");
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("Leaky tap")).toBeTruthy();
    await act(async () => lastAlertButton(DISCARD_MESSAGES.discard).onPress?.());
    expect(screen.getByText("sheet closed")).toBeTruthy();
  });

  it("asks the same question on the screen reader's escape gesture, and closes on Discard", async () => {
    await render(<NoteSheet />);
    await fireEvent.changeText(screen.getByLabelText("Note"), "Leaky tap");
    await fireEvent(screen.getByTestId(SHEET_MODAL_ROOT_TEST_ID), "accessibilityEscape");
    expect(alert).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("Leaky tap")).toBeTruthy();
    await act(async () => lastAlertButton(DISCARD_MESSAGES.discard).onPress?.());
    expect(screen.getByText("sheet closed")).toBeTruthy();
  });

  it("closes on the escape gesture straight away when nothing was typed", async () => {
    await render(<NoteSheet />);
    await fireEvent(screen.getByTestId(SHEET_MODAL_ROOT_TEST_ID), "accessibilityEscape");
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByText("sheet closed")).toBeTruthy();
  });

  it("ignores the escape gesture while a save is on its way", async () => {
    await render(<NoteSheet isBusy />);
    await fireEvent.changeText(screen.getByLabelText("Note"), "Leaky tap");
    await fireEvent(screen.getByTestId(SHEET_MODAL_ROOT_TEST_ID), "accessibilityEscape");
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Leaky tap")).toBeTruthy();
  });

  it("doesn't ask when a save closes it", async () => {
    await render(<NoteSheet />);
    await fireEvent.changeText(screen.getByLabelText("Note"), "Leaky tap");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByText("sheet closed")).toBeTruthy();
  });

  it("can't be closed while a save is on its way", async () => {
    await render(<NoteSheet isBusy />);
    await fireEvent.changeText(screen.getByLabelText("Note"), "Leaky tap");
    await fireEvent(screen.getByTestId(FORM_SHEET_TEST_ID), "requestClose");
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Leaky tap")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
