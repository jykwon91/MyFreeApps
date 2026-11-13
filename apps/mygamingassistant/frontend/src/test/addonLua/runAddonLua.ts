import { lauxlib, lua, lualib, to_luastring } from "fengari";
import { WOW_TOOLTIP_STUBS } from "@/test/addonLua/wowTooltipStubs.lua";

type LuaState = ReturnType<typeof lauxlib.luaL_newstate>;

function call(L: LuaState, name: string, code: string, results: number): void {
  if (lauxlib.luaL_loadbuffer(L, to_luastring(code), null, to_luastring(name)) || lua.lua_pcall(L, 0, results, 0)) {
    throw new Error(`${name}: ${lua.lua_tojsstring(L, -1)}`);
  }
}

/**
 * Runs Lua chunks in order (name, code) on top of WoW stubs (the tooltip stubs
 * unless given others); returns every line the stubs recorded into `out`.
 */
export function runAddonLua(chunks: readonly [string, string][], stubs: string = WOW_TOOLTIP_STUBS): string[] {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  call(L, "stubs", stubs, 0);
  for (const [name, code] of chunks) call(L, name, code, 0);
  call(L, "lines", "return table.concat(out, string.char(10))", 1);
  const text = lua.lua_tojsstring(L, -1);
  return text ? text.split("\n") : [];
}
