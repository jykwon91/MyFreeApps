import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import CalendarMonthNav from "../src/features/calendar/CalendarMonthNav";
import { monthOf, shiftMonth } from "../src/lib/localDate";
import { monthTitle } from "../src/features/calendar/calendarDisplay";

const MONTH = shiftMonth(monthOf(new Date()), -3);

async function renderNav() {
  const handlers = { onChange: jest.fn(), onToday: jest.fn(), onJump: jest.fn() };
  await render(<CalendarMonthNav month={MONTH} isThisMonth={false} {...handlers} />);
  return handlers;
}

describe("CalendarMonthNav at large text sizes", () => {
  it("lets the month title wrap and shrink instead of scaling the text down", async () => {
    await renderNav();

    const title = screen.getByText(`${monthTitle(MONTH)} ▾`);

    expect(title.props.adjustsFontSizeToFit).toBeFalsy();
    expect(title.props.numberOfLines).toBeUndefined();
    expect(StyleSheet.flatten(title.props.style).flexShrink).toBe(1);
  });

  it("wraps the controls onto another line rather than squeezing them", async () => {
    await renderNav();

    const row = screen.getByTestId("calendar-month-nav");

    expect(StyleSheet.flatten(row.props.style).flexWrap).toBe("wrap");
  });

  it("keeps the arrows, title and Today pressable", async () => {
    const { onChange, onToday, onJump } = await renderNav();

    fireEvent.press(screen.getByRole("button", { name: /^Previous month/ }));
    fireEvent.press(screen.getByRole("button", { name: /^Next month/ }));
    fireEvent.press(screen.getByRole("button", { name: monthTitle(MONTH) }));
    fireEvent.press(screen.getByRole("button", { name: "Today" }));

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onToday).toHaveBeenCalledTimes(1);
  });
});
