import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { FakeTurnStream } from "./FakeTurnStream";

/** How the fake server answers a turn: a refusal, a streamed reply, or no connection at all. */
export type FakeTurnAnswer = FakeReply | { stream: FakeTurnStream } | { unreachable: true };
