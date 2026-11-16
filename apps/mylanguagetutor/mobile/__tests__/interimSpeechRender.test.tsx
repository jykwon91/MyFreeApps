import { VOICE_PRIVACY_ACK_STORAGE_ITEM } from "@mylanguagetutor/api-client/constants/voicePrivacyAck";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { act, screen } from "@testing-library/react-native";
import { finish, serverWrites } from "../test-support/conversation";
import { finishSpeaking } from "../test-support/fakeSpeech";
import { goQuiet, hear, installRecognizer } from "../test-support/fakeSpeechRecognition";
import { openCafeConversation, phone, resetVoiceConversation, tapToSpeak } from "../test-support/voiceConversation";

const mockRenders = { learnerBubble: 0 };

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo/fetch", () => jest.requireActual("../test-support/fakeExpoFetch"));
jest.mock("expo-speech", () => jest.requireActual("../test-support/fakeSpeech"));
jest.mock("expo-keep-awake", () => ({ useKeepAwake: () => {} }));
// A learner bubble draws only when its transcript entry does, so its draws count the entry's.
jest.mock("../src/features/conversation/LearnerBubble", () => {
  const actual = jest.requireActual("../src/features/conversation/LearnerBubble");
  return {
    __esModule: true,
    default: (props: { text: string }) => {
      mockRenders.learnerBubble += 1;
      return actual.default(props);
    },
  };
});

beforeEach(() => {
  resetVoiceConversation();
});

describe("words heard while the learner speaks", () => {
  it("show up without redrawing the conversation so far", async () => {
    installRecognizer();
    storedItems.set(VOICE_PRIVACY_ACK_STORAGE_ITEM, "may_send");
    const { streams } = await openCafeConversation();
    await tapToSpeak();
    await phone(() => goQuiet("Quiero un café"));
    await serverWrites(() => streams[0].emit("reply.delta", { text: "¡Claro!" }));
    await finish(streams[0]);
    await act(async () => finishSpeaking());

    await tapToSpeak();
    const drawn = mockRenders.learnerBubble;
    await phone(() => hear("Otro"));
    await phone(() => hear("Otro café"));
    await phone(() => hear("Otro café, por favor"));

    expect(screen.getByTestId("heard-so-far")).toHaveTextContent("Otro café, por favor");
    expect(mockRenders.learnerBubble).toBe(drawn);
  });
});
