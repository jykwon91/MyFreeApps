import { useId, useState } from "react";
import { AlertBox } from "@platform/ui";
import MacroCard from "@/games/wow-forever/components/macros/MacroCard";
import { MACRO_MAX_LENGTH } from "@/games/wow-forever/data/macros/macroMaxLength";
import { SPELL_NAME_MAX_LENGTH } from "@/games/wow-forever/data/macros/macroTemplates";
import { TAG_DEFAULT_SPELL, TAG_MAX_MOBS, TAG_SECTION_ID } from "@/games/wow-forever/data/macros/tagMacro";
import { useScrollToHashOnLoad } from "@/games/wow-forever/hooks/useScrollToHashOnLoad";
import { buildTagMacro, parseMobNames } from "@/games/wow-forever/lib/macros/tagMacro";

const FIELD = "border rounded-md px-3 py-2 text-base sm:text-sm min-h-[44px] w-full bg-card";

function summaryFor(mobs: readonly string[], spell: string): string {
  const cast = spell.trim() || TAG_DEFAULT_SPELL;
  if (mobs.length === 0) return `Paste a mob's name above. The macro targets it by its exact name and casts ${cast} on it.`;
  if (mobs.length === 1) return `Targets ${mobs[0]} by its exact name and casts ${cast} on it. Does nothing if it isn't close enough to target or is dead.`;
  return `Targets whichever of these is up (the last one in the list if several are) and casts ${cast} on it. Does nothing if none is close enough to target.`;
}

/** "Tag a mob first": paste a mob's name, get a macro that targets it and casts an instant spell. */
export default function TagMacroSection() {
  const [names, setNames] = useState("");
  const [spell, setSpell] = useState(TAG_DEFAULT_SPELL);
  const [skull, setSkull] = useState(false);
  const id = useId();
  useScrollToHashOnLoad(TAG_SECTION_ID);
  const mobs = parseMobNames(names);
  const text = buildTagMacro({ mobs, spell, skull });
  return (
    <section id={TAG_SECTION_ID} aria-labelledby={`${id}-heading`} className="space-y-3 scroll-mt-4">
      <h2 id={`${id}-heading`} className="text-lg font-semibold">
        Tag a mob first
      </h2>
      <p className="text-sm text-muted-foreground">
        Paste a rare&apos;s or quest mob&apos;s name and press the macro the moment it appears: it targets the mob and hits it before
        anyone else can.
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-names`} className="text-xs font-medium text-muted-foreground">
            Mob name (one per line, up to {TAG_MAX_MOBS})
          </label>
          <textarea
            id={`${id}-names`}
            aria-describedby={`${id}-names-hint`}
            value={names}
            rows={2}
            placeholder="e.g. Lord Gregor Lescovar"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setNames(e.target.value)}
            className={FIELD}
            data-testid="tag-mob-names"
          />
          <span id={`${id}-names-hint`} className="text-xs text-muted-foreground">
            Spell it exactly as the game does: the macro only finds a mob with exactly this name.
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-spell`} className="text-xs font-medium text-muted-foreground">
            Spell to tag with
          </label>
          <input
            id={`${id}-spell`}
            type="text"
            value={spell}
            maxLength={SPELL_NAME_MAX_LENGTH}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setSpell(e.target.value)}
            className={FIELD}
            data-testid="tag-spell"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm min-h-[44px] cursor-pointer w-fit">
        <input type="checkbox" checked={skull} onChange={(e) => setSkull(e.target.checked)} className="h-5 w-5" />
        Put a skull on it too (may only work in a group)
      </label>
      <MacroCard headingLevel="h3" title="Tag macro" summary={summaryFor(mobs, spell)} text={text} />
      {text.length > MACRO_MAX_LENGTH && (
        <AlertBox variant="warning">
          Too long for one macro ({text.length} of {MACRO_MAX_LENGTH} characters). Remove a name, or the skull.
        </AlertBox>
      )}
    </section>
  );
}
