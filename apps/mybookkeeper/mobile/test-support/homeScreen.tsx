import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, render, screen } from "@testing-library/react-native";
import { Provider } from "react-redux";
import HomeScreen from "../src/features/home/HomeScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

/** Signs in to a fresh cache, as every Home test starts. */
export function resetHome(): void {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
}

export async function renderHome(): Promise<void> {
  await render(
    <Provider store={store}>
      <HomeScreen />
    </Provider>,
  );
}

type Answer = (config: { url?: string }) => Promise<unknown>;

/** Answers the picked requests differently. The returned function puts the previous answers back. */
function answerWith(pick: (url: string) => boolean, instead: (config: { url?: string }) => Promise<unknown>): () => void {
  const previous = api.defaults.adapter;
  const answer = previous as Answer;
  api.defaults.adapter = ((config: { url?: string }) => (pick(config.url ?? "") ? instead(config) : answer(config))) as typeof api.defaults.adapter;
  return () => {
    api.defaults.adapter = previous;
  };
}

/** Fails these requests as if offline, until the returned function is called. */
export function failRequests(...urls: string[]): () => void {
  return answerWith(
    (url) => urls.includes(url),
    (config) => Promise.reject(Object.assign(new Error("Network Error"), { config })),
  );
}

/** Leaves a request unanswered, so the screen stays mid-load for it. */
export function holdRequests(...urls: string[]): void {
  void answerWith(
    (url) => urls.includes(url),
    () => new Promise(() => undefined),
  );
}

/** Leaves the period's numbers unanswered: their address carries the dates. */
export function holdSummary(): void {
  void answerWith(
    (url) => url.startsWith("/summary?"),
    () => new Promise(() => undefined),
  );
}

export async function pull(): Promise<void> {
  await act(async () => {
    await screen.getByTestId("home-screen").props.refreshControl.props.onRefresh();
  });
}

/** Answers one request with a fixed body, as the server would, until the returned function is called. */
export function answerRequest(url: string, body: unknown): () => void {
  return answerWith(
    (requested) => requested === url,
    (config) => Promise.resolve({ data: body, status: 200, statusText: "", headers: {}, config }),
  );
}
