import type { FakeParams } from "./FakeParams";
import type { FakeReply } from "./FakeReply";

/** May answer later, so a test can see what the screen shows while it waits. */
export type FakeRoute = (body: Record<string, unknown>, params: FakeParams) => FakeReply | Promise<FakeReply>;
