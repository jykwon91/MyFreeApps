import { Stack, useLocalSearchParams } from "expo-router";
import PropertyDetailScreen from "../../../../src/features/properties/PropertyDetailScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function PropertyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Property", headerBackTitle: "Properties" }} />
      <ValidRoute uuids={["id"]}>
        <PropertyDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
