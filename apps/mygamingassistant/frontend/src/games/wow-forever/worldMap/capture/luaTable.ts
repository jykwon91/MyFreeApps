/**
 * A small reader for WoW SavedVariables files — `Name = { ... }` assignments
 * of Lua table constructors, strings, numbers, booleans and nil.
 *
 * It only READS data: there is no evaluation, so an uploaded file can't run
 * anything. Tables whose keys are exactly 1..n become arrays; every other
 * table becomes a plain object keyed by the key's text.
 */

export type LuaValue = string | number | boolean | null | LuaValue[] | LuaObject;
export interface LuaObject {
  [key: string]: LuaValue;
}

/** SavedVariables for one addon stay far below this; anything bigger isn't one. */
export const MAX_SAVED_VARIABLES_BYTES = 5_000_000;
const MAX_DEPTH = 40;
const BYTE_ORDER_MARK = 0xfeff;

export class LuaParseError extends Error {}

const ESCAPES: Readonly<Record<string, string>> = {
  n: "\n",
  t: "\t",
  r: "\r",
  a: "\u0007",
  b: "\b",
  f: "\f",
  v: "\v",
  "\\": "\\",
  '"': '"',
  "'": "'",
  "\n": "\n",
};

const NAME = /[A-Za-z_][A-Za-z0-9_]*/y;
const NUMBER = /-?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y;

class Reader {
  private pos = 0;

  constructor(private readonly text: string) {}

  fail(message: string): never {
    const line = this.text.slice(0, this.pos).split("\n").length;
    throw new LuaParseError(`${message} (line ${line})`);
  }

  skipSpace(): void {
    for (;;) {
      while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) this.pos++;
      if (!this.text.startsWith("--", this.pos)) return;
      const end = this.text.indexOf("\n", this.pos);
      this.pos = end < 0 ? this.text.length : end + 1;
    }
  }

  atEnd(): boolean {
    this.skipSpace();
    return this.pos >= this.text.length;
  }

  peek(): string {
    this.skipSpace();
    return this.text[this.pos] ?? "";
  }

  expect(char: string): void {
    if (this.peek() !== char) this.fail(`expected "${char}"`);
    this.pos++;
  }

  accept(char: string): boolean {
    if (this.peek() !== char) return false;
    this.pos++;
    return true;
  }

  match(pattern: RegExp): string | null {
    this.skipSpace();
    pattern.lastIndex = this.pos;
    const found = pattern.exec(this.text);
    if (!found) return null;
    this.pos += found[0].length;
    return found[0];
  }

  /** `Name =` — the start of an assignment or a named table field. */
  nameAssignment(): string | null {
    const start = this.pos;
    const name = this.match(NAME);
    if (name && this.peek() === "=" && this.text[this.pos + 1] !== "=") {
      this.pos++;
      return name;
    }
    this.pos = start;
    return null;
  }

  string(): string {
    const quote = this.text[this.pos];
    this.pos++;
    let out = "";
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos++];
      if (ch === quote) return out;
      if (ch === "\n") this.fail("unfinished text");
      if (ch !== "\\") {
        out += ch;
        continue;
      }
      const next = this.text[this.pos++];
      const digits = /^\d{1,3}/.exec(this.text.slice(this.pos - 1, this.pos + 2));
      if (digits) {
        out += String.fromCharCode(Number(digits[0]));
        this.pos += digits[0].length - 1;
      } else if (next in ESCAPES) {
        out += ESCAPES[next];
      } else {
        this.fail(`unknown escape "\\${next}"`);
      }
    }
    return this.fail("unfinished text");
  }

  value(depth: number): LuaValue {
    if (depth > MAX_DEPTH) this.fail("tables nested too deeply");
    const ch = this.peek();
    if (ch === "{") return this.table(depth + 1);
    if (ch === '"' || ch === "'") return this.string();
    const number = this.match(NUMBER);
    if (number !== null) return Number(number);
    const word = this.match(NAME);
    if (word === "true") return true;
    if (word === "false") return false;
    if (word === "nil") return null;
    return this.fail("expected a value");
  }

  table(depth: number): LuaValue {
    this.expect("{");
    const entries: [string | number, LuaValue][] = [];
    let nextIndex = 1;
    while (!this.accept("}")) {
      if (this.accept("[")) {
        const key = this.value(depth);
        this.expect("]");
        this.expect("=");
        if (typeof key !== "string" && typeof key !== "number") this.fail("table keys must be text or numbers");
        entries.push([key, this.value(depth)]);
      } else {
        const name = this.nameAssignment();
        if (name !== null) entries.push([name, this.value(depth)]);
        else entries.push([nextIndex++, this.value(depth)]);
      }
      if (!this.accept(",") && !this.accept(";") && this.peek() !== "}") this.fail('expected "," or "}"');
    }
    return toLuaValue(entries);
  }
}

function toLuaValue(entries: readonly [string | number, LuaValue][]): LuaValue {
  const isArray = entries.length > 0 && entries.every(([key], i) => key === i + 1);
  if (isArray) return entries.map(([, value]) => value);
  const object: LuaObject = {};
  for (const [key, value] of entries) {
    // nil fields don't exist in Lua.
    if (value !== null) object[String(key)] = value;
  }
  return object;
}

/** Parse a SavedVariables file into its top-level variables. */
export function parseSavedVariables(text: string): LuaObject {
  if (text.length > MAX_SAVED_VARIABLES_BYTES) throw new LuaParseError("That file is too big to be addon data.");
  // Some editors save with a byte-order mark.
  const reader = new Reader(text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text);
  const variables: LuaObject = {};
  while (!reader.atEnd()) {
    const name = reader.nameAssignment();
    if (name === null) return reader.fail("expected NAME = value");
    const value = reader.value(0);
    if (value !== null) variables[name] = value;
  }
  return variables;
}
