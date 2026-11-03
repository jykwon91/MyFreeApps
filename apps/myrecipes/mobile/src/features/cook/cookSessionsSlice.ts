import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { CookSession } from "../../types/CookSession";
import type { CookSessionTarget } from "../../types/CookSessionTarget";
import { resumableCookSession } from "../../utils/resumableCookSession";

const initialState: Record<string, CookSession> = {};

// Expiry is decided once, on opening, so a long braise can't lose its place mid-cook.
function sessionFor(state: Record<string, CookSession>, { recipeId, versionId, now }: CookSessionTarget): CookSession {
  const existing = state[recipeId];
  const session: CookSession =
    existing?.versionId === versionId ? existing : { versionId, pageIndex: 0, checked: [], updatedAt: now };
  session.updatedAt = now;
  state[recipeId] = session;
  return state[recipeId];
}

const cookSessionsSlice = createSlice({
  name: "cookSessions",
  initialState,
  reducers: {
    sessionOpened(state, { payload }: PayloadAction<CookSessionTarget & { lastPage: number }>) {
      const { lastPage, now, recipeId, versionId } = payload;
      if (!resumableCookSession(state[recipeId], versionId, lastPage, now)) delete state[recipeId];
    },
    pageChanged(state, { payload }: PayloadAction<CookSessionTarget & { pageIndex: number }>) {
      sessionFor(state, payload).pageIndex = payload.pageIndex;
    },
    ingredientToggled(state, { payload }: PayloadAction<CookSessionTarget & { ingredientId: string }>) {
      const session = sessionFor(state, payload);
      session.checked = session.checked.includes(payload.ingredientId)
        ? session.checked.filter((id) => id !== payload.ingredientId)
        : [...session.checked, payload.ingredientId];
    },
    sessionFinished(state, { payload }: PayloadAction<string>) {
      delete state[payload];
    },
  },
});

export const { ingredientToggled, pageChanged, sessionFinished, sessionOpened } = cookSessionsSlice.actions;
export default cookSessionsSlice.reducer;
