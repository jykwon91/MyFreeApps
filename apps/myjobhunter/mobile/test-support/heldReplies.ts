import { act } from "@testing-library/react-native";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { FakeRoute } from "@platform/mobile/test-support/types/FakeRoute";

/** A route holding each request until the test answers it, by the order they were sent. */
export function heldReplies() {
  const answers: ((reply: FakeReply) => void)[] = [];
  const route: FakeRoute = () => new Promise<FakeReply>((resolve) => answers.push(resolve));
  return { route, answer: async (index: number, reply: FakeReply) => act(async () => answers[index]?.(reply)) };
}
