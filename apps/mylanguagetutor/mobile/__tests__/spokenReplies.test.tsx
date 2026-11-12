import { NORMAL_RATE, SLOW_RATE } from "@mylanguagetutor/api-client/constants/speechRates";
import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { baseApi } from "@platform/core/store/baseApi";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { storeSession } from "@platform/mobile/test-support/storedSession";
import { act, fireEvent, screen } from "@testing-library/react-native";
import type { IntlWithSegmenter } from "@mylanguagetutor/api-client/types/speech/intl-with-segmenter";
import type { Voice } from "expo-speech";
import { router } from "expo-router";
import { AccessibilityInfo } from "react-native";
import { store } from "../src/lib/store";
import { finish, moveApp, openCafe, serveConversation, serverWrites, write } from "../test-support/conversation";
import { serveTurns, turnStream } from "../test-support/fakeExpoFetch";
import { failVoice, installVoices, maxSpeechInputLength, reportFailures, resetSpeech, saidSinceStop, spoken, voice } from "../test-support/fakeSpeech";
import { PRACTICE_HEADING } from "../test-support/onboardedLearner";
import type { FakeTurnStreamOptions } from "../test-support/types/FakeTurnStreamOptions";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo/fetch", () => jest.requireActual("../test-support/fakeExpoFetch"));
jest.mock("expo-speech", () => jest.requireActual("../test-support/fakeSpeech"));
jest.mock("expo-keep-awake", () => ({ useKeepAwake: () => {} }));

const MEXICO = voice("com.apple.voice.compact.es-MX.Paulina", "es-MX");
const SPAIN = voice("com.apple.voice.compact.es-ES.Monica", "es-ES");
/** The next words of a reply, reaching the phone just as it stops the turn. */
const LATE_WORDS = { event: "reply.delta", data: { text: "Bienvenido. ¿Qué quieres? " } };
const ENGLISH = voice("com.apple.voice.compact.en-US.Samantha", "en-US");

const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions");
const announceNow = jest.spyOn(AccessibilityInfo, "announceForAccessibility");

let hidden: { intl: IntlWithSegmenter; segmenter: IntlWithSegmenter["Segmenter"] } | null = null;

/**
 * The phone's JavaScript engine, Hermes, has no Intl.Segmenter: replies split as they would there.
 * After rendering, because the router's fake timers swap in their own Intl.
 */
function withoutSegmenter(): void {
  const intl = Intl as unknown as IntlWithSegmenter;
  hidden = { intl, segmenter: intl.Segmenter };
  delete intl.Segmenter;
}

afterEach(() => {
  if (hidden) hidden.intl.Segmenter = hidden.segmenter;
  hidden = null;
});

const warn = jest.spyOn(console, "warn");

beforeEach(() => {
  warn.mockReset();
  storedItems.clear();
  storeSession();
  resetSpeech();
  installVoices([ENGLISH, SPAIN, MEXICO]);
  announce.mockClear();
  announceNow.mockClear();
  store.dispatch(baseApi.util.resetApiState());
});

/** Opens the cafe conversation and sends `text`, with the reply streaming back on the stream returned. */
async function sendTurn(text = "Hola", options: FakeTurnStreamOptions = {}) {
  serveConversation();
  const stream = turnStream(options);
  serveTurns(() => ({ stream }));
  await openCafe();
  withoutSegmenter();
  await write(text);
  return stream;
}

describe("spoken replies", () => {
  it("speaks each sentence as soon as it has arrived, in the Spanish voice, before the reply has finished", async () => {
    const stream = await sendTurn();
    expect((Intl as unknown as IntlWithSegmenter).Segmenter).toBeUndefined();
    expect(spoken).toEqual([null]);

    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola! ¿Qué te" }));
    expect(saidSinceStop()).toEqual(["¡Hola!"]);
    await serverWrites(() => stream.emit("reply.delta", { text: " sirvo? (What can I get you?) Tenemos" }));
    expect(saidSinceStop()).toEqual(["¡Hola!", "¿Qué te sirvo?"]);

    await serverWrites(() => stream.emit("reply.delta", { text: " café 😊" }));
    await finish(stream);
    // The English gloss and the emoji are shown, not said.
    expect(saidSinceStop()).toEqual(["¡Hola!", "¿Qué te sirvo?", "Tenemos café"]);
    expect(spoken.filter((utterance) => utterance !== null).map((utterance) => utterance.options)).toEqual(
      Array(3).fill({ language: "es-MX", voice: MEXICO.identifier, rate: NORMAL_RATE, useApplicationAudioSession: false }),
    );
  });

  it("uses another Spanish voice when the phone has none from Mexico", async () => {
    installVoices([ENGLISH, SPAIN]);
    const stream = await sendTurn();
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola! " }));
    expect(spoken[spoken.length - 1]?.options.voice).toBe(SPAIN.identifier);
  });

  it.each([
    ["no voice speaks Spanish", [ENGLISH]],
    ["the phone lists no voices, as Android does when its engine never starts", []],
    ["listing the voices fails", new Error("Unable to get voices")],
  ])("still speaks Spanish in the phone's default voice when %s", async (_case, voices) => {
    installVoices(voices);
    const stream = await sendTurn();
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola! " }));
    expect(spoken[spoken.length - 1]).toEqual({
      text: "¡Hola!",
      options: { language: "es-MX", voice: undefined, rate: NORMAL_RATE, useApplicationAudioSession: false },
    });
    // The replay buttons stay: the reply can still be heard.
    await finish(stream);
    expect(screen.getByRole("button", { name: PRACTICE_COPY.replay })).toBeTruthy();
  });

  it("plays a reply again from the start, at the normal pace or slower", async () => {
    const stream = await sendTurn();
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola! ¿Qué quieres?" }));
    await finish(stream);
    expect(screen.getByText(PRACTICE_COPY.replay)).toBeTruthy();
    expect(screen.getByText(PRACTICE_COPY.replaySlow)).toBeTruthy();
    // Named by what they show, so voice control finds them; what they do is in the hint.
    expect(screen.getByRole("button", { name: PRACTICE_COPY.replay })).toBe(screen.getByHintText(PRACTICE_COPY.replayHint));
    expect(screen.getByRole("button", { name: PRACTICE_COPY.replaySlow })).toBe(screen.getByHintText(PRACTICE_COPY.replaySlowHint));

    await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.replay }));
    expect(spoken[spoken.length - 3]).toBeNull();
    expect(saidSinceStop()).toEqual(["¡Hola!", "¿Qué quieres?"]);
    expect(spoken.slice(-2).map((utterance) => utterance?.options.rate)).toEqual([NORMAL_RATE, NORMAL_RATE]);

    await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.replaySlow }));
    expect(spoken[spoken.length - 3]).toBeNull();
    expect(saidSinceStop()).toEqual(["¡Hola!", "¿Qué quieres?"]);
    expect(spoken.slice(-2).map((utterance) => utterance?.options.rate)).toEqual([SLOW_RATE, SLOW_RATE]);
  });

  it("stops speaking when the learner sends the next turn", async () => {
    serveConversation();
    const streams = [turnStream(), turnStream()];
    let turn = 0;
    serveTurns(() => ({ stream: streams[turn++] }));
    await openCafe();
    withoutSegmenter();
    await write("Hola");
    await serverWrites(() => streams[0].emit("reply.delta", { text: "¡Hola! ¿Qué quieres? " }));
    await finish(streams[0]);

    await write("Un café");
    expect(spoken[spoken.length - 1]).toBeNull();
    await serverWrites(() => streams[1].emit("reply.delta", { text: "¡Claro! " }));
    expect(saidSinceStop()).toEqual(["¡Claro!"]);
  });

  it("stops speaking when the learner leaves the conversation", async () => {
    const stream = await sendTurn();
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola! " }));
    await act(async () => router.back());

    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
    expect(spoken[spoken.length - 1]).toBeNull();
  });

  it("stops speaking when the app goes to the background, and doesn't say the rest of a cut-off reply", async () => {
    const stream = await sendTurn();
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola! Bienvenido" }));
    await moveApp("background");

    expect(spoken[spoken.length - 1]).toBeNull();
    await moveApp("active");
    expect(await screen.findByText(PRACTICE_COPY.replyCutOff)).toBeTruthy();
    expect(saidSinceStop()).toEqual([]);
  });

  it("stops speaking in the background even once the whole reply has arrived", async () => {
    const stream = await sendTurn();
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola! ¿Qué quieres?" }));
    await finish(stream);
    await moveApp("background");
    expect(spoken[spoken.length - 1]).toBeNull();
  });

  it("still announces the finished reply politely when a screen reader is on, as the website's live region does", async () => {
    const screenReader = jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(true);
    const stream = await sendTurn();
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola! ¿Qué quieres?" }));
    expect(announce).not.toHaveBeenCalledWith(expect.stringContaining("¡Hola!"), expect.anything());
    await finish(stream);

    expect(saidSinceStop()).toEqual(["¡Hola!", "¿Qué quieres?"]);
    expect(announce).toHaveBeenCalledWith("¡Hola! ¿Qué quieres?", { queue: true });
    expect(announceNow).not.toHaveBeenCalledWith(expect.stringContaining("¡Hola!"));
    // The reply is still there to read, by who said it.
    expect(screen.getByLabelText("Tutor: ¡Hola! ¿Qué quieres?")).toBeTruthy();
    screenReader.mockRestore();
  });

  it("doesn't say what arrives after the app went to the background", async () => {
    const stream = await sendTurn("Hola", { arrivesAsStopped: LATE_WORDS });
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola! " }));
    await moveApp("background");

    expect(spoken[spoken.length - 1]).toBeNull();
    expect(saidSinceStop()).toEqual([]);
  });

  it("doesn't say what arrives after the learner left the conversation", async () => {
    const stream = await sendTurn("Hola", { arrivesAsStopped: LATE_WORDS });
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola! " }));
    await act(async () => router.back());

    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
    expect(spoken[spoken.length - 1]).toBeNull();
    expect(saidSinceStop()).toEqual([]);
  });

  it("speaks the rest of a reply in the Spanish voice once the phone's voice list arrives mid-reply", async () => {
    let listVoices: (voices: Voice[]) => void = () => {};
    installVoices(new Promise<Voice[]>((resolve) => (listVoices = resolve)));
    const stream = await sendTurn();
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola! " }));
    expect(spoken[spoken.length - 1]?.options.voice).toBeUndefined();

    await act(async () => listVoices([ENGLISH, MEXICO]));
    await serverWrites(() => stream.emit("reply.delta", { text: "¿Qué quieres? " }));
    expect(saidSinceStop()).toEqual(["¡Hola!", "¿Qué quieres?"]);
    expect(spoken[spoken.length - 1]?.options.voice).toBe(MEXICO.identifier);
  });

  it("says a sentence again in the phone's default voice when the chosen voice fails, and drops that voice", async () => {
    failVoice(MEXICO.identifier);
    const stream = await sendTurn();
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola! ¿Qué quieres? " }));
    expect(saidSinceStop()).toEqual([]);

    await act(async () => expect(reportFailures()).toBe(2));
    expect(saidSinceStop()).toEqual(["¡Hola!", "¿Qué quieres?"]);
    expect(spoken.slice(-2).map((utterance) => utterance?.options.voice)).toEqual([undefined, undefined]);

    // The rest of the reply goes straight to the phone's pick, rather than failing first.
    await serverWrites(() => stream.emit("reply.delta", { text: "Tenemos café. " }));
    expect(saidSinceStop()).toEqual(["¡Hola!", "¿Qué quieres?", "Tenemos café."]);
    expect(spoken[spoken.length - 1]?.options.voice).toBeUndefined();
    expect(reportFailures()).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it("doesn't say a failed sentence again once speech has stopped", async () => {
    failVoice(MEXICO.identifier);
    const stream = await sendTurn();
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola! " }));
    await moveApp("background");

    await act(async () => expect(reportFailures()).toBe(1));
    expect(spoken[spoken.length - 1]).toBeNull();
    expect(saidSinceStop()).toEqual([]);
  });

  it("skips a sentence too long for the phone to say, and carries on with the reply", async () => {
    const stream = await sendTurn();
    const tooLong = `${"Hola ".repeat(maxSpeechInputLength / 5)}amigo.`;
    await serverWrites(() => stream.emit("reply.delta", { text: `${tooLong} ¿Qué quieres? ` }));

    expect(saidSinceStop()).toEqual(["¿Qué quieres?"]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.join(" ")).not.toContain("Hola");
  });
});
