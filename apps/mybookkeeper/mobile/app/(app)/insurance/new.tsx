import { Stack } from "expo-router";
import { POLICY_FORM_MESSAGES } from "../../../src/constants/insuranceForm";
import NewPolicyScreen from "../../../src/features/insurance/NewPolicyScreen";

export default function NewPolicyRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: POLICY_FORM_MESSAGES.addTitle, headerBackTitle: "Insurance" }} />
      <NewPolicyScreen />
    </>
  );
}
