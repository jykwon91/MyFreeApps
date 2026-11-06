import { configureStore } from "@reduxjs/toolkit";
import { triageApi } from "@/games/wow-forever/api/triageApi";

/**
 * The triage screen's own Redux store (nested `<Provider>` in `WowTriagePage`): private triage data never
 * enters the app-wide store, and locking drops it with one `resetApiState()`.
 */
export const triageStore = configureStore({
  reducer: { [triageApi.reducerPath]: triageApi.reducer },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(triageApi.middleware),
});

/** Drop every cached triage read and write (Lock, idle lock, a refused key). */
export function clearTriageData(): void {
  triageStore.dispatch(triageApi.util.resetApiState());
}
