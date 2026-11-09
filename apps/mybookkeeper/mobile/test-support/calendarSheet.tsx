import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Provider } from "react-redux";
import CalendarScreen from "../src/features/calendar/CalendarScreen";
import { monthOf, shiftMonth } from "../src/lib/localDate";
import { store } from "../src/lib/store";
import { anEvent } from "./calendarServer";

export const THIS_MONTH = monthOf(new Date());

export function aBookingThisMonth(overrides: Parameters<typeof anEvent>[0] = {}) {
  return anEvent({ starts_on: THIS_MONTH, ends_on: shiftMonth(THIS_MONTH, 1), ...overrides });
}

/** Renders the calendar and opens the booking at the given place name. */
export async function openBooking(place = "Maple Room"): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <CalendarScreen />
      </ToastProvider>
    </Provider>,
  );
  await fireEvent.press((await screen.findAllByRole("button", { name: new RegExp(place) }))[0]);
}
