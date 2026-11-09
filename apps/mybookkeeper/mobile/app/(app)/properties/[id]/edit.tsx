import { Stack, useLocalSearchParams } from "expo-router";
import PropertyEditScreen from "../../../../src/features/properties/PropertyEditScreen";

export default function PropertyEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit property", headerBackTitle: "Property" }} />
      <PropertyEditScreen id={id} />
    </>
  );
}
