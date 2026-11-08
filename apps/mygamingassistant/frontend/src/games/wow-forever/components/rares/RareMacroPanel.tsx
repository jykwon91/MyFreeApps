import { useMemo } from "react";
import clsx from "clsx";
import CopyButton from "@/games/wow-forever/components/worldMap/CopyButton";
import { MACRO_MAX_CHARS } from "@/games/wow-forever/data/rares/raresConfig";
import { targetMacros } from "@/games/wow-forever/lib/rares/targetMacros";
import type { Rare } from "@/games/wow-forever/types/rares/rare";

/** `/target` macros for every rare in the list, split to fit the game's 255 characters, each with its count and a copy button. */
export default function RareMacroPanel({ rares }: { rares: readonly Rare[] }) {
  const macros = useMemo(() => targetMacros(rares.map((r) => r.name)), [rares]);
  if (macros.length === 0) return null;
  return (
    <details className="rounded-xl border bg-card p-3 text-sm sm:p-4" data-testid="rare-macros">
      <summary className="min-h-[44px] cursor-pointer content-center font-medium">
        Copy macro — /target the {rares.length === 1 ? "rare" : `${rares.length} rares`} in this list
        {macros.length > 1 ? ` (${macros.length} macros)` : ""}
      </summary>
      <p className="mt-2 text-muted-foreground">
        Make a macro in game (Esc → Macros → New), paste one of these and press it to target any of these rares that's
        near you. A macro holds at most {MACRO_MAX_CHARS} characters, so a long list is split.
      </p>
      <ol className="mt-3 space-y-3">
        {macros.map((macro, i) => (
          <li key={macro.text} className="space-y-2" data-testid="rare-macro">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{macros.length > 1 ? `Macro ${i + 1}` : "Macro"}</span>
              <span
                className={clsx("tabular-nums text-xs", macro.length > MACRO_MAX_CHARS ? "text-red-600" : "text-muted-foreground")}
                data-testid="rare-macro-count"
              >
                {macro.length} / {MACRO_MAX_CHARS} characters
              </span>
            </div>
            <pre className="whitespace-pre-wrap break-all rounded bg-muted/40 p-2 text-xs">{macro.text}</pre>
            <CopyButton text={macro.text} label={macros.length > 1 ? `Copy macro ${i + 1}` : "Copy macro"} title="Copy this macro" />
          </li>
        ))}
      </ol>
    </details>
  );
}
