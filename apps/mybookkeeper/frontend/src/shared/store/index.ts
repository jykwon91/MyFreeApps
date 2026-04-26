import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "./baseApi";
import documentUploadReducer from "./documentUploadSlice";
import organizationReducer from "./organizationSlice";

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    documentUpload: documentUploadReducer,
    organization: organizationReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(baseApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
