import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TranscriptList from "@/features/session/TranscriptList";
import type { TranscriptEntry } from "@mylanguagetutor/api-client/types/session/transcript-entry";

const PAGE_HEIGHT = 2000;
const VIEWPORT_HEIGHT = 800;

const ENTRY: TranscriptEntry = {
  key: "turn-1",
  learnerText: "Hola",
  replyText: "¡Hola!",
  translation: null,
  corrections: [],
  retryPrompt: null,
  status: "pending",
  correctionsMissing: false,
};

function list(entries: TranscriptEntry[]) {
  return (
    <TranscriptList
      entries={entries}
      languageName="Spanish"
      canSpeak
      canReplay
      waiting={false}
      busy={false}
      onReplay={vi.fn()}
      onTryRetry={vi.fn()}
      onSkipRetry={vi.fn()}
    />
  );
}

function scrollPageTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

describe("TranscriptList following", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
    Object.defineProperty(window, "innerHeight", { value: VIEWPORT_HEIGHT, configurable: true });
    Object.defineProperty(document.documentElement, "scrollHeight", { value: PAGE_HEIGHT, configurable: true });
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });

  it("leaves a reader who scrolled up alone while a reply streams in", () => {
    const { rerender } = render(list([ENTRY]));
    scrollPageTo(PAGE_HEIGHT - VIEWPORT_HEIGHT);
    scrollPageTo(100);
    scrollIntoView.mockClear();

    rerender(list([{ ...ENTRY, replyText: "¡Hola! ¿Qué" }]));

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("follows a streaming reply while the reader is at the end", () => {
    const { rerender } = render(list([ENTRY]));
    scrollPageTo(PAGE_HEIGHT - VIEWPORT_HEIGHT - 10);
    scrollIntoView.mockClear();

    rerender(list([{ ...ENTRY, replyText: "¡Hola! ¿Qué" }]));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("brings a reader who scrolled up back to the end when they send a new turn", () => {
    const { rerender } = render(list([ENTRY]));
    scrollPageTo(PAGE_HEIGHT - VIEWPORT_HEIGHT);
    scrollPageTo(100);
    scrollIntoView.mockClear();

    rerender(list([ENTRY, { ...ENTRY, key: "turn-2", replyText: "" }]));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("keeps following while its own smooth scroll passes points far from the end", () => {
    const { rerender } = render(list([ENTRY]));
    scrollPageTo(300);
    scrollPageTo(600);
    scrollIntoView.mockClear();

    rerender(list([{ ...ENTRY, replyText: "¡Hola! ¿Qué" }]));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
