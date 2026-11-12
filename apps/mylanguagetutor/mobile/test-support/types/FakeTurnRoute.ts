import type { FakeTurnAnswer } from "./FakeTurnAnswer";
import type { FakeTurnRequest } from "./FakeTurnRequest";

/** May answer later, so a test can see the screen while the turn waits. */
export type FakeTurnRoute = (request: FakeTurnRequest) => FakeTurnAnswer | Promise<FakeTurnAnswer>;
