import { Stack } from "expo-router";
import { RENTAL_ROI_MESSAGES as MESSAGES } from "../../../src/constants/rentalRoi";
import RentalRoiScreen from "../../../src/features/analytics/RentalRoiScreen";

export default function RentalRoiRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.title, headerBackTitle: MESSAGES.backTitle }} />
      <RentalRoiScreen />
    </>
  );
}
