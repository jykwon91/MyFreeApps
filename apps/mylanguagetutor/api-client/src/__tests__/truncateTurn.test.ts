import { describe, expect, it } from "vitest";
import { truncateTurn } from "../utils/truncateTurn";

describe("truncateTurn", () => {
  it("leaves an answer within the limit alone, trimmed", () => {
    expect(truncateTurn("  Hola, ¿qué tal?  ", 50)).toEqual({ text: "Hola, ¿qué tal?", truncated: false });
    expect(truncateTurn("12345", 5)).toEqual({ text: "12345", truncated: false });
  });

  it("cuts at the last sentence end within the limit", () => {
    const text = "Hola amigo. ¿Cómo estás? Estoy muy bien gracias";
    expect(truncateTurn(text, 30)).toEqual({ text: "Hola amigo. ¿Cómo estás?", truncated: true });
  });

  it("keeps a closing quote with its sentence", () => {
    expect(truncateTurn('Dijo "hola." Luego se fue', 16)).toEqual({ text: 'Dijo "hola."', truncated: true });
  });

  it("cuts at an East Asian sentence end, which has no space after it", () => {
    expect(truncateTurn("こんにちは。元気ですか。はい", 12)).toEqual({ text: "こんにちは。元気ですか。", truncated: true });
  });

  it("ignores a full stop inside a word or number", () => {
    expect(truncateTurn("Cuesta 3.50 euros por favor", 12)).toEqual({ text: "Cuesta 3.50", truncated: true });
  });

  it("falls back to the last whole word when there is no sentence end", () => {
    expect(truncateTurn("quiero un café con leche por favor", 20)).toEqual({ text: "quiero un café con", truncated: true });
  });

  it("keeps the word that ends exactly at the limit", () => {
    expect(truncateTurn("quiero un café con leche", 18)).toEqual({ text: "quiero un café con", truncated: true });
  });

  it("cuts at the limit when there is no boundary at all", () => {
    expect(truncateTurn("abcdefghijklmnop", 10)).toEqual({ text: "abcdefghij", truncated: true });
  });
});
