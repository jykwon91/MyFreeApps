import { describe, expect, it } from "vitest";
import { createSentenceChunker, splitSentences } from "@/features/speech/sentenceChunker";

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
