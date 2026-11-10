import { act, screen } from "@testing-library/react-native";
import { router, Stack } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Alert, type AlertButton, Text } from "react-native";
import { DISCARD_MESSAGES } from "../constants/discard";
import { useDiscardPrompt } from "../hooks/useDiscardPrompt";

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

function lastAlertButton(label: string): AlertButton {
  const button = alert.mock.calls.at(-1)?.[2]?.find((candidate) => candidate.text === label);
  if (!button) throw new Error(`No "${label}" button on the last alert`);
  return button;
}

function FormScreen({ hasUnsavedChanges, isBusy }: { hasUnsavedChanges: boolean; isBusy: boolean }) {
  useDiscardPrompt(hasUnsavedChanges, isBusy);
  return <Text>form-screen</Text>;
}

/** The real router, because a mocked one can't tell whether the screen really goes. */
async function leaveForm(hasUnsavedChanges: boolean, isBusy = false): Promise<void> {
  await renderRouter(
    {
      _layout: () => <Stack />,
      index: () => <Text>previous-screen</Text>,
      form: () => <FormScreen hasUnsavedChanges={hasUnsavedChanges} isBusy={isBusy} />,
    },
    { initialUrl: "/" },
  );
  await act(async () => router.push("/form"));
  await act(async () => router.back());
}

beforeEach(() => alert.mockClear());

it("asks before unsaved changes are thrown away, and stays on Keep editing", async () => {
  await leaveForm(true);
  expect(alert).toHaveBeenCalledWith(DISCARD_MESSAGES.discardTitle, DISCARD_MESSAGES.discardBody, [
    { text: DISCARD_MESSAGES.keepEditing, style: "cancel" },
    { text: DISCARD_MESSAGES.discard, style: "destructive", onPress: expect.any(Function) },
  ]);
  expect(screen.getByText("form-screen")).toBeTruthy();
});

it("leaves on Discard", async () => {
  await leaveForm(true);
  await act(async () => lastAlertButton(DISCARD_MESSAGES.discard).onPress?.());
  expect(screen.getByText("previous-screen")).toBeTruthy();
  expect(screen.queryByText("form-screen")).toBeNull();
});

it("can't be walked away from while a save is in flight", async () => {
  await leaveForm(true, true);
  expect(alert).not.toHaveBeenCalled();
  expect(screen.getByText("form-screen")).toBeTruthy();
});

it("goes without asking when nothing is unsaved", async () => {
  await leaveForm(false);
  expect(alert).not.toHaveBeenCalled();
  expect(screen.getByText("previous-screen")).toBeTruthy();
});
