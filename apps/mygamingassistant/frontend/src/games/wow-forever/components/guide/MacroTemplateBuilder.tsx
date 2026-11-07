import { useId, useState } from "react";
import MacroTextCard from "@/games/wow-forever/components/guide/MacroTextCard";
import { MOUSEOVER_TEMPLATES, SPELL_NAME_MAX_LENGTH, SPELL_PLACEHOLDER } from "@/games/wow-forever/data/guide/macroTemplates";
import { fillMacroTemplate } from "@/games/wow-forever/lib/macroTemplates";

/** "Make your own": type any spell and every template fills in with it. */
export default function MacroTemplateBuilder() {
  const [spell, setSpell] = useState("");
  const inputId = useId();
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold">Make your own, for any class</h3>
      <div className="flex flex-col gap-1 max-w-sm">
        <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
          Your spell name
        </label>
        <input
          id={inputId}
          aria-describedby={`${inputId}-hint`}
          type="text"
          value={spell}
          maxLength={SPELL_NAME_MAX_LENGTH}
          placeholder="e.g. Flash Heal"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setSpell(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm min-h-[44px] w-full bg-card"
        />
        <span id={`${inputId}-hint`} className="text-xs text-muted-foreground">
          Leave it empty to copy with &ldquo;{SPELL_PLACEHOLDER}&rdquo;, then type the spell in the game.
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {MOUSEOVER_TEMPLATES.map((template) => (
          <MacroTextCard
            key={template.id}
            title={template.title}
            summary={template.useFor}
            text={fillMacroTemplate(template, spell)}
          />
        ))}
      </div>
    </div>
  );
}
