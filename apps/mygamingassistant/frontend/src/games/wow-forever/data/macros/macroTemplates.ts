import type { MacroTemplate } from "@/games/wow-forever/types/macros/macroTemplate";

/** Shown in a template until the player types a spell name. */
export const SPELL_PLACEHOLDER = "Spell Name";

/** Room for any spell plus a rank ("Spell(Rank 10)") while every template stays under the 255-character limit. */
export const SPELL_NAME_MAX_LENGTH = 60;

export const MOUSEOVER_TEMPLATES: readonly MacroTemplate[] = [
  {
    id: "friendly",
    title: "Hover cast on a friend",
    useFor:
      "Use this for heals, buffs and cleanses. It casts on the friend under your mouse; with nobody there, on your friendly target; with no target, on you.",
    conditions: "[@mouseover,help,nodead][help,nodead][@player]",
  },
  {
    id: "enemy",
    title: "Hover cast on an enemy",
    useFor:
      "Use this for damage over time, debuffs and interrupts. It casts on the enemy under your mouse; with nobody there, on your target.",
    conditions: "[@mouseover,harm,nodead][]",
  },
  {
    id: "mouseover-only",
    title: "Hover cast only",
    useFor:
      "Use this for any spell you only ever want on whoever is under your mouse. With nobody there it does nothing, so it never lands on the wrong one.",
    conditions: "[@mouseover,exists,nodead]",
  },
];

export const MACRO_STEPS: readonly string[] = [
  "Type /macro in chat (or press Esc and choose Macros) to open the macro window.",
  "Choose New, type a name and pick the red question-mark icon. With #showtooltip at the top, it turns into your spell's icon.",
  "Press Copy on a macro here and paste it into the big text box.",
  "Drag the macro's icon from the window onto your action bar.",
];

export const MACRO_TIPS: readonly string[] = [
  "Hover cast (\"mouseover\") means your mouse pointer is over someone: their party or raid frame, their name plate, or the character in the world. Empty ground doesn't count.",
  "Type the spell name exactly as your spellbook shows it. Leave the rank off and the game casts the highest rank you know.",
  "To cast a lower rank (cheaper on mana), add it in brackets with no space: Healing Touch(Rank 1).",
  "One macro holds at most 255 characters. The count under each macro shows how many it uses.",
];
