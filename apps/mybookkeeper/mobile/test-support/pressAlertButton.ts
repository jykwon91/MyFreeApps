import { act } from "@testing-library/react-native";
import type { Alert } from "react-native";

/** Taps a button of the most recent Alert, as the person would. */
export async function pressAlertButton(alertSpy: jest.SpiedFunction<typeof Alert.alert>, text: string): Promise<void> {
  const buttons = alertSpy.mock.calls.at(-1)?.[2] ?? [];
  await act(async () => buttons.find((candidate) => candidate.text === text)?.onPress?.());
}
