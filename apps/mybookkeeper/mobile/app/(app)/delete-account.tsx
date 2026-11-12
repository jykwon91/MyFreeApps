import { DeleteAccountScreen } from "@platform/mobile";
import { Stack, useLocalSearchParams } from "expo-router";
import {
  DELETE_ACCOUNT_BACK_TITLE,
  DELETE_ACCOUNT_BACK_TITLE_FROM_SECURITY,
  DELETE_ACCOUNT_FROM_SECURITY,
  DELETE_ACCOUNT_TITLE,
  DELETE_ACCOUNT_WARNING,
} from "../../src/constants/deleteAccount";

export default function DeleteAccountRoute() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const headerBackTitle = from === DELETE_ACCOUNT_FROM_SECURITY ? DELETE_ACCOUNT_BACK_TITLE_FROM_SECURITY : DELETE_ACCOUNT_BACK_TITLE;
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: DELETE_ACCOUNT_TITLE, headerBackTitle }} />
      <DeleteAccountScreen warning={DELETE_ACCOUNT_WARNING} />
    </>
  );
}
