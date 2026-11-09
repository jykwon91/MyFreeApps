import { Stack } from "expo-router";
import { PROPERTY_PNL_MESSAGES as MESSAGES } from "../../../src/constants/propertyPnl";
import PropertyPnlScreen from "../../../src/features/propertyPnl/PropertyPnlScreen";

export default function PropertyPnlRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.title, headerBackTitle: MESSAGES.backTitle }} />
      <PropertyPnlScreen />
    </>
  );
}
