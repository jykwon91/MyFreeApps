import { Stack } from "expo-router";
import PropertyCreateScreen from "../../../src/features/properties/PropertyCreateScreen";

export default function PropertyNewRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "New property", headerBackTitle: "Properties" }} />
      <PropertyCreateScreen />
    </>
  );
}
