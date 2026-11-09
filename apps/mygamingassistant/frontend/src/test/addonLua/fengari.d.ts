declare module "fengari" {
  type LuaState = object;
  export const lua: {
    lua_pcall(L: LuaState, nargs: number, nresults: number, errfunc: number): number;
    lua_tojsstring(L: LuaState, index: number): string;
  };
  export const lauxlib: {
    luaL_newstate(): LuaState;
    luaL_loadbuffer(L: LuaState, code: Uint8Array, size: null, name: Uint8Array): number;
  };
  export const lualib: { luaL_openlibs(L: LuaState): void };
  export function to_luastring(text: string): Uint8Array;
}
