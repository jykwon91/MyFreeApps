import { Stack, useLocalSearchParams } from "expo-router";
import PropertyEditScreen from "../../../../src/features/properties/PropertyEditScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function PropertyEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit property", headerBackTitle: "Property" }} />
      <ValidRoute uuids={["id"]}>
        <PropertyEditScreen id={id} />
      </ValidRoute>
    </>
  );
}
