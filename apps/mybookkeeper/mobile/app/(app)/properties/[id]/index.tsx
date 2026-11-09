import { Stack, useLocalSearchParams } from "expo-router";
import PropertyDetailScreen from "../../../../src/features/properties/PropertyDetailScreen";

export default function PropertyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Property", headerBackTitle: "Properties" }} />
      <PropertyDetailScreen id={id} />
    </>
  );
}
