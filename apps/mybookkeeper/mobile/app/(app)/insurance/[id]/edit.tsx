import { Stack, useLocalSearchParams } from "expo-router";
import { POLICY_FORM_MESSAGES } from "../../../../src/constants/insuranceForm";
import EditPolicyScreen from "../../../../src/features/insurance/EditPolicyScreen";

export default function EditPolicyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: POLICY_FORM_MESSAGES.editTitle, headerBackTitle: "Policy" }} />
      <EditPolicyScreen id={id} />
    </>
  );
}
