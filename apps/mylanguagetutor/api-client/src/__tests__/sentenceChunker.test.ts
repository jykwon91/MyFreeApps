import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSentenceChunker, splitSentences } from "../utils/sentenceChunker";
import { spokenSentences } from "../utils/spokenSentences";
import type { IntlWithSegmenter } from "../types/speech/intl-with-segmenter";


describe("createSentenceChunker (regex fallback)", () => {
  it("holds back the last, possibly unfinished sentence", () => {
    const chunker = createSentenceChunker("es-MX", null);
    expect(chunker.push("¡Hola! ¿Cómo")).toEqual(["¡Hola!"]);
    expect(chunker.push(" estás? Bien")).toEqual(["¿Cómo estás?"]);
    expect(chunker.flush()).toEqual(["Bien"]);
  });

  it("returns nothing until a boundary arrives", () => {
    const chunker = createSentenceChunker("es-MX", null);
    expect(chunker.push("Buenos")).toEqual([]);
    expect(chunker.push(" días")).toEqual([]);
    expect(chunker.flush()).toEqual(["Buenos días"]);
  });

  it("flush on an empty buffer returns nothing", () => {
    const chunker = createSentenceChunker("es-MX", null);
    expect(chunker.flush()).toEqual([]);
  });

  it("emits several sentences from one chunk", () => {
    const chunker = createSentenceChunker("es-MX", null);
    expect(chunker.push("Uno. Dos. Tres")).toEqual(["Uno.", "Dos."]);
  });
});

describe("createSentenceChunker (Intl.Segmenter)", () => {
  it("uses the provided segmenter", () => {
    const segmenter = {
      segment: (input: string) => input.split("|").map((segment) => ({ segment })),
    };
    const chunker = createSentenceChunker("es-MX", segmenter);
    expect(chunker.push("a|b|c")).toEqual(["a", "b"]);
    expect(chunker.flush()).toEqual(["c"]);
  });
});

describe("splitSentences", () => {
  it("keeps the text intact when rejoined", () => {
    const text = "Hola. ¿Qué tal? Muy bien";
    expect(splitSentences(text, null).join("")).toBe(text);
  });
});

describe("createSentenceChunker without Intl.Segmenter (the phone's Hermes runtime)", () => {
  const intl = Intl as unknown as IntlWithSegmenter;
  const segmenter = intl.Segmenter;
  beforeEach(() => {
    delete intl.Segmenter;
  });
  afterEach(() => {
    intl.Segmenter = segmenter;
  });

  it("splits a streamed reply with the punctuation fallback", () => {
    expect(intl.Segmenter).toBeUndefined();
    const chunker = createSentenceChunker("es-MX");
    expect(chunker.push("¡Hola! ¿Cómo")).toEqual(["¡Hola!"]);
    expect(chunker.push(" estás? Bien")).toEqual(["¿Cómo estás?"]);
    expect(chunker.flush()).toEqual(["Bien"]);
  });

  it("splits a whole reply for replay", () => {
    expect(spokenSentences("Uno. ¿Dos? ¡Tres!", "es-MX")).toEqual(["Uno.", "¿Dos?", "¡Tres!"]);
  });
});

describe("createSentenceChunker with Intl.Segmenter (the browser)", () => {
  it("uses the runtime's segmenter, so the website's sentences don't change", () => {
    // The punctuation fallback needs a space after the full stop; Intl.Segmenter splits at the line break.
    const chunker = createSentenceChunker("es-MX");
    expect(chunker.push("Primero esto\nLuego aquello. Y")).toEqual(["Primero esto", "Luego aquello."]);
    expect(createSentenceChunker("es-MX", null).push("Primero esto\nLuego aquello. Y")).toEqual([
      "Primero esto\nLuego aquello.",
    ]);
  });
});

describe("spokenSentences", () => {
  it("returns every sentence of a whole reply, the last one included", () => {
    expect(spokenSentences("¡Hola! ¿Qué quieres?", "es-MX")).toEqual(["¡Hola!", "¿Qué quieres?"]);
    expect(spokenSentences("   ", "es-MX")).toEqual([]);
  });
});
