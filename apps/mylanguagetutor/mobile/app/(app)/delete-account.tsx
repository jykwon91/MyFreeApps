import { DeleteAccountScreen } from "@platform/mobile";
import { Stack } from "expo-router";
import { ACCOUNT_COPY } from "@mylanguagetutor/api-client/constants/accountCopy";

export default function DeleteAccountRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Delete account" }} />
      <DeleteAccountScreen warning={ACCOUNT_COPY.deleteWarning} />
    </>
  );
}
