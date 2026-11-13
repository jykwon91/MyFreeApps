/** Holds a stubbed response back until the spec releases it. For E2E tests only. */
import type { Gate } from "./types/Gate";

export function createGate(): Gate {
  let release: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release: () => release() };
}
