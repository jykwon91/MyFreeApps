import { DeleteAccountScreen } from "@platform/mobile";
import { Stack } from "expo-router";
import { DELETE_ACCOUNT_WARNING } from "../../src/constants/deleteAccount";

export default function DeleteAccountRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Delete account" }} />
      <DeleteAccountScreen warning={DELETE_ACCOUNT_WARNING} />
    </>
  );
}
