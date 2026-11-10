import type { FakeParams } from "./FakeParams";

export interface SentRequest {
  route: string;
  body: Record<string, unknown>;
  params: FakeParams;
  authorization: string | undefined;
}
