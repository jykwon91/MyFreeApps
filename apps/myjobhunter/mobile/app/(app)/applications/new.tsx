import { Stack } from "expo-router";
import { ADD_APPLICATION_MESSAGES as MESSAGES } from "../../../src/constants/addApplication";
import AddApplicationScreen from "../../../src/features/addApplication/AddApplicationScreen";

export default function AddApplicationRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.screenTitle, headerBackTitle: MESSAGES.backTitle }} />
      <AddApplicationScreen />
    </>
  );
}
