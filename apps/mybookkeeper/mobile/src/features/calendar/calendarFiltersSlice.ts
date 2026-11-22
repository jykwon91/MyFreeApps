import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { CalendarFilters } from "../../types/CalendarFilters";
import { NO_CALENDAR_FILTERS } from "./calendarFilters";

/**
 * Kept in the store, not the screen, so the choices outlive leaving the calendar and coming back.
 * Like the other lists' filters they last until the app closes or the account changes.
 */
const calendarFiltersSlice = createSlice({
  name: "calendarFilters",
  initialState: NO_CALENDAR_FILTERS,
  reducers: {
    calendarFiltersChanged: (_state, { payload }: PayloadAction<CalendarFilters>) => payload,
  },
});

export const { calendarFiltersChanged } = calendarFiltersSlice.actions;
export default calendarFiltersSlice.reducer;
