/** A run of ordinary text, or one invisible / direction-changing character made visible as `⟨U+XXXX⟩`. */
export type HiddenCharSegment = { kind: "text"; text: string } | { kind: "hidden"; codePoint: string };
