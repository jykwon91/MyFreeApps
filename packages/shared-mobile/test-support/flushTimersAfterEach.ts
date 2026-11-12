import { cleanup } from "@testing-library/react-native";

/** True while Jest's fake clock is installed: its timers carry the clock they belong to. */
function hasFakeTimers(): boolean {
  return "clock" in setTimeout;
}

// renderApp puts each test on a fresh fake clock, which drops whatever the last test left pending.
// Among those can be the timer Redux Toolkit notifies screens of store updates on, queued as a
// test's screen unmounts; once it's dropped, later screens in that file never hear from the shared
// store again. So once each test has unmounted, its timers are run out.
afterEach(async () => {
  await cleanup();
  if (hasFakeTimers()) jest.runAllTimers();
});
