import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@platform/ui";
import jobAnalysisReducer from "@/store/jobAnalysisSlice";

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    jobAnalysis: jobAnalysisReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(baseApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
