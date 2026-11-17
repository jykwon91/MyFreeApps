import { Stack, useLocalSearchParams } from "expo-router";
import PromoteScreen from "../../../../src/features/applicants/PromoteScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function PromoteRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Promote to applicant", headerBackTitle: "Cancel" }} />
      <ValidRoute uuids={["id"]}>
        <PromoteScreen id={id} />
      </ValidRoute>
    </>
  );
}
