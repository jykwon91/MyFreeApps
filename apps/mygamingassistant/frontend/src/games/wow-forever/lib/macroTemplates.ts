import { MOUSEOVER_TEMPLATES, SPELL_PLACEHOLDER } from "@/games/wow-forever/data/guide/macroTemplates";
import type { MacroTemplate } from "@/games/wow-forever/types/macroTemplate";
import type { MacroTemplateId } from "@/games/wow-forever/types/macroTemplateId";

/** The macro text with the player's spell, or the placeholder while they haven't typed one. */
export function fillMacroTemplate(template: MacroTemplate, spellName: string): string {
  const spell = spellName.trim() || SPELL_PLACEHOLDER;
  return `#showtooltip\n/cast ${template.conditions} ${spell}`;
}

export function findMacroTemplate(id: MacroTemplateId): MacroTemplate {
  const template = MOUSEOVER_TEMPLATES.find((t) => t.id === id);
  if (!template) throw new Error(`Unknown macro template: ${id}`);
  return template;
}
