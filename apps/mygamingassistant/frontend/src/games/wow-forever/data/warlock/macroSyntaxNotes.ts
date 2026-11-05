import type { WarlockMacroSyntax } from "@/games/wow-forever/types/warlockMacroSyntax";

/** What is unconfirmed about each kind of syntax. The game can't be run here, so none of it is tested in game. */
export const SYNTAX_NOTES: Readonly<Record<WarlockMacroSyntax, string>> = {
  focus: "Uses a focus target ([@focus] or /focus). Not confirmed to exist in Forever.",
  mouseover: "Uses [@mouseover]. Not confirmed to work in Forever.",
  castsequence: "Uses /castsequence. Not confirmed to work in Forever.",
  stopcasting: "Uses /stopcasting. Not confirmed to behave as in later versions of the game.",
  petCast: "Casts a pet ability with /cast. Not confirmed in Forever; if nothing happens, use the pet's action bar.",
};
