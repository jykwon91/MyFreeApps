import { describe, expect, it } from "vitest";
import { speakableText } from "@/features/speech/speakableText";

describe("speakableText", () => {
  it("drops parenthetical English glosses", () => {
    expect(speakableText("¿Quieres un café? (Do you want a coffee?)")).toBe("¿Quieres un café?");
  });

  it("strips markdown and emoji", () => {
    expect(speakableText("**Muy** _bien_ 🎉")).toBe("Muy bien");
  });

  it("returns an empty string when nothing is speakable", () => {
    expect(speakableText("(just a gloss) 👍")).toBe("");
  });
});
