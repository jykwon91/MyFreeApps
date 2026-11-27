import { luaString } from "@/games/wow-forever/lib/auctionHouse/luaString";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Tables nested this deep or deeper are written on one line, so a profession's steps read one per line in a diff. */
const MULTILINE_DEPTH = 4;

const INDENT = "  ";

function keyLua(key: string): string {
  return IDENTIFIER.test(key) ? key : `[${luaString(key)}]`;
}

function scalarLua(value: unknown): string {
  if (typeof value === "string") return luaString(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new Error(`Addon data holds something Lua can't write: ${String(value)}`);
}

/**
 * A Lua literal for plain data: strings, numbers, booleans, arrays and objects. Object fields that are null or undefined
 * are left out (Lua's nil), so the addon tests a field with `if x.field then`.
 */
export function luaValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value !== "object") return scalarLua(value);
  const entries = Array.isArray(value)
    ? value.map((item) => luaValue(item, depth + 1))
    : Object.entries(value as Record<string, unknown>)
        .filter(([, field]) => field !== null && field !== undefined)
        .map(([key, field]) => `${keyLua(key)} = ${luaValue(field, depth + 1)}`);
  if (entries.length === 0) return "{}";
  if (depth >= MULTILINE_DEPTH) return `{${entries.join(", ")}}`;
  const pad = INDENT.repeat(depth + 1);
  return `{\n${entries.map((entry) => `${pad}${entry},`).join("\n")}\n${INDENT.repeat(depth)}}`;
}
