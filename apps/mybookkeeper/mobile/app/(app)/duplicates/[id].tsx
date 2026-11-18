import { Stack, useLocalSearchParams } from "expo-router";
import DuplicateCompareScreen from "../../../src/features/duplicates/DuplicateCompareScreen";
import ValidRoute from "../../../src/features/routing/ValidRoute";

export default function DuplicateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Compare", headerBackTitle: "Duplicates" }} />
      <ValidRoute uuids={["id"]}>
        <DuplicateCompareScreen id={id} />
      </ValidRoute>
    </>
  );
}
