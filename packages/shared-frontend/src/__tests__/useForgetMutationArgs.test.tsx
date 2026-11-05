import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { useForgetMutationArgs } from "../hooks/useForgetMutationArgs";

const api = createApi({
  baseQuery: fakeBaseQuery<string>(),
  endpoints: (build) => ({
    check: build.mutation<string, { password: string }>({
      queryFn: ({ password }) => (password === "right" ? { data: "ok" } : { error: "no" }),
    }),
  }),
});

function useCheck() {
  const [check, state] = api.useCheckMutation();
  useForgetMutationArgs(state.originalArgs, state.isLoading, state.reset);
  return { check, originalArgs: state.originalArgs };
}

function renderCheck() {
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return renderHook(useCheck, { wrapper });
}

describe("useForgetMutationArgs", () => {
  it.each(["right", "wrong"])("forgets the arguments of the first call, password %s", async (password) => {
    const { result } = renderCheck();

    await act(async () => {
      await result.current.check({ password });
    });

    expect(result.current.originalArgs).toBeUndefined();
  });
});
