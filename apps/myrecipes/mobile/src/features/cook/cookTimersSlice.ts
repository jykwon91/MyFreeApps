import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { CookTimer } from "../../types/CookTimer";
import type { CookTimerAlert } from "../../types/CookTimerAlert";

const initialState: { items: CookTimer[]; hasAskedForAlerts: boolean } = {
  items: [],
  hasAskedForAlerts: false,
};

const cookTimersSlice = createSlice({
  name: "cookTimers",
  initialState,
  reducers: {
    timerStarted(state, { payload }: PayloadAction<CookTimer>) {
      state.items = [...state.items.filter((timer) => timer.id !== payload.id), payload];
      state.hasAskedForAlerts = true;
    },
    timerAlertSet(state, { payload }: PayloadAction<{ id: string; endsAt: number; alert: CookTimerAlert }>) {
      const timer = state.items.find((item) => item.id === payload.id && item.endsAt === payload.endsAt);
      if (timer) timer.alert = payload.alert;
    },
    timerRemoved(state, { payload }: PayloadAction<string>) {
      state.items = state.items.filter((timer) => timer.id !== payload);
    },
    timersCleared(state) {
      state.items = [];
    },
    timersRestored(state, { payload }: PayloadAction<CookTimer[]>) {
      const known = new Set(state.items.map((timer) => timer.id));
      const restored = payload.filter((timer) => !known.has(timer.id)).map((timer) => ({ ...timer, alert: "scheduled" as const }));
      state.items.push(...restored);
    },
  },
});

export const { timerAlertSet, timerRemoved, timerStarted, timersCleared, timersRestored } = cookTimersSlice.actions;
export default cookTimersSlice.reducer;
