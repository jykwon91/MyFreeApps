import type { FakeReply } from "./FakeReply";

export type FakeRoute = (body: Record<string, unknown>) => FakeReply;
