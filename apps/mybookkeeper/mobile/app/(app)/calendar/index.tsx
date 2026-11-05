import { Stack } from "expo-router";
import CalendarScreen from "../../../src/features/calendar/CalendarScreen";

export default function CalendarRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Calendar", headerBackTitle: "More" }} />
      <CalendarScreen />
    </>
  );
}
