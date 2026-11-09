import { Stack, useLocalSearchParams } from "expo-router";
import EditPolicyScreen from "../../../../src/features/insurance/EditPolicyScreen";

export default function EditPolicyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit policy", headerBackTitle: "Policy" }} />
      <EditPolicyScreen id={id} />
    </>
  );
}
