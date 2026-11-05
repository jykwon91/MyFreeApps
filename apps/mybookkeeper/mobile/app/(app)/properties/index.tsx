import { Stack } from "expo-router";
import PropertiesScreen from "../../../src/features/properties/PropertiesScreen";

export default function PropertiesRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Properties", headerBackTitle: "More" }} />
      <PropertiesScreen />
    </>
  );
}
