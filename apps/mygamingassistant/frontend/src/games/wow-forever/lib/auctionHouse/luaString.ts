const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g; // eslint-disable-line no-control-regex
const BACKSLASH = /\\/g;
const QUOTE = /"/g;

/** A double-quoted Lua string literal: backslashes and quotes escaped, control characters dropped. */
export function luaString(text: string): string {
  const escaped = text.replace(CONTROL_CHARACTERS, "").replace(BACKSLASH, "\\\\").replace(QUOTE, '\\"');
  return '"' + escaped + '"';
}
