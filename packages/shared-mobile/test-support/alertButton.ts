import { Alert, type AlertButton } from "react-native";

/** The button labelled `label` on the last Alert shown. Alert.alert must be spied on. */
export function alertButton(label: string): AlertButton {
  const button = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]?.find((candidate) => candidate.text === label);
  if (!button) throw new Error(`No "${label}" button on the last alert`);
  return button;
}
