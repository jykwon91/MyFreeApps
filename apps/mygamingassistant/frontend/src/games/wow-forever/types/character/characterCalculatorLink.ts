/** The talent calculator link for a saved set, or why there isn't one (null = nothing to say: no points). */
export type CharacterCalculatorLink = { kind: "link"; href: string } | { kind: "none"; reason: string | null };
