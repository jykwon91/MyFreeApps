import type { ReactElement } from "react";
import { configureStore } from "@reduxjs/toolkit";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { baseApi } from "@/shared/store/baseApi";

/** Renders `ui` at `path` with a fresh store, so each test starts with an empty query cache. Returns a cleanup. */
export function renderWithStore(ui: ReactElement, path: string): () => void {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </Provider>,
  );
  return () =>
    act(() => {
      store.dispatch(baseApi.util.resetApiState());
    });
}
