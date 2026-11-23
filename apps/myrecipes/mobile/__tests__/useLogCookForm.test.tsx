import api from "@platform/core/lib/api";
import { SessionProvider, ToastProvider, type MobileSession, type SessionState } from "@platform/mobile";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { useLogCookForm } from "../src/features/cookLog/useLogCookForm";
import { makeStore } from "../src/lib/store";

const COOK = { id: "c1", version_id: "v1", rating: null, notes: null, cooked_at: "2026-11-11T00:00:00Z" };

const sent: InternalAxiosRequestConfig[] = [];
let gate: Promise<void> = Promise.resolve();
const originalAdapter = api.defaults.adapter;

const adapter: AxiosAdapter = async (config) => {
  sent.push(config);
  await gate;
  return { status: 201, data: COOK, statusText: "", headers: {}, config };
};

const SIGNED_IN: SessionState = { status: "signedIn", email: "sam@example.com", sessionId: "s1" };
const session = { start: async () => {}, getState: () => SIGNED_IN, subscribe: () => () => {} } as unknown as MobileSession;

function Providers({ children }: { children: ReactNode }) {
  return (
    <Provider store={makeStore()}>
      <SessionProvider session={session}>
        <ToastProvider bottomOffset={0}>{children}</ToastProvider>
      </SessionProvider>
    </Provider>
  );
}

beforeEach(() => {
  api.defaults.adapter = adapter;
  sent.length = 0;
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("useLogCookForm", () => {
  it("logs one cook when Save is pressed twice before the sheet has re-rendered", async () => {
    let open = () => {};
    gate = new Promise((resolve) => {
      open = resolve;
    });
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useLogCookForm("r1", "v1", onSaved), { wrapper: Providers });

    // Both run against the same render, where isSaving is still false.
    await act(async () => {
      void result.current.save();
      void result.current.save();
    });

    expect(sent.filter((config) => config.method === "post")).toHaveLength(1);
    await act(async () => open());
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(sent.filter((config) => config.method === "post")).toHaveLength(1);
  });
});
