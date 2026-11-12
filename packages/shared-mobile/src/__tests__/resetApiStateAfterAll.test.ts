import { configureStore } from "@reduxjs/toolkit";
import { createApi } from "@reduxjs/toolkit/query";
import { resetTrackedStores, trackApiStores } from "../../test-support/resetApiStateAfterAll";

function makeApi(reducerPath: string) {
  return createApi({
    reducerPath,
    baseQuery: async () => ({ data: "ok" }),
    endpoints: (build) => ({ read: build.query<string, void>({ query: () => "" }) }),
  });
}

type TestApi = ReturnType<typeof makeApi>;

/** A store for a tracked api that has read once and let go, which is when RTK Query starts the timer that drops the result. */
async function releasedStore(api: TestApi) {
  trackApiStores([api]);
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });
  const subscription = store.dispatch(api.endpoints.read.initiate());
  await subscription;
  subscription.unsubscribe();
  return store;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  resetTrackedStores();
  jest.useRealTimers();
});

describe("resetTrackedStores", () => {
  it("cancels the timers a store started for a query nobody is reading any more", async () => {
    await releasedStore(makeApi("cancelsApi"));
    const waiting = jest.getTimerCount();
    expect(waiting).toBeGreaterThan(0);

    expect(resetTrackedStores()).toBe(true);

    // What's left is the subscription sync timer, which RTK Query can't cancel, and it is short:
    // the 60 second one that drops the unused result would still be pending after this.
    expect(jest.getTimerCount()).toBeLessThan(waiting);
    jest.advanceTimersByTime(1000);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("reaches every store the api was used to build, not just the first", async () => {
    const api = makeApi("severalApi");
    await Promise.all([releasedStore(api), releasedStore(api)]);
    const waiting = jest.getTimerCount();
    expect(waiting).toBeGreaterThan(1);

    resetTrackedStores();
    jest.advanceTimersByTime(1000);

    expect(jest.getTimerCount()).toBe(0);
  });

  it("leaves an api alone once it is registered, however often it is registered again", () => {
    const api = makeApi("twiceApi");
    trackApiStores([api]);
    const hooked = api.middleware;

    trackApiStores([api]);

    expect(api.middleware).toBe(hooked);
  });

  it("finds nothing to reset once the stores have been reset", async () => {
    await releasedStore(makeApi("onceApi"));
    resetTrackedStores();

    expect(resetTrackedStores()).toBe(false);
  });

  it("still sees the stores when this file is loaded again by resetModules or isolateModules", async () => {
    await releasedStore(makeApi("sharedApi"));

    let fromFreshLoad = false;
    jest.isolateModules(() => {
      const fresh = jest.requireActual<typeof import("../../test-support/resetApiStateAfterAll")>("../../test-support/resetApiStateAfterAll");
      fromFreshLoad = fresh.resetTrackedStores();
    });

    expect(fromFreshLoad).toBe(true);
  });
});
