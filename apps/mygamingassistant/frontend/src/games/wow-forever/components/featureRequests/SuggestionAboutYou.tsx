import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import ChoiceSelect from "@/games/wow-forever/components/shared/ChoiceSelect";
import MultiChoiceChips from "@/games/wow-forever/components/shared/MultiChoiceChips";
import {
  CONTEXT_ACTIVITIES,
  CONTEXT_CLASSES,
  CONTEXT_EXPERIENCES,
  CONTEXT_FACTIONS,
  CONTEXT_LEVEL_BANDS,
  CONTEXT_PROFESSIONS,
} from "@/games/wow-forever/data/featureRequests/featureRequestEnums";
import {
  CONTEXT_ACTIVITY_LABEL,
  CONTEXT_CLASS_LABEL,
  CONTEXT_EXPERIENCE_LABEL,
  CONTEXT_FACTION_LABEL,
  CONTEXT_LEVEL_BAND_LABEL,
  CONTEXT_PROFESSION_LABEL,
} from "@/games/wow-forever/data/featureRequests/featureRequestLabels";
import type { AboutYouState } from "@/games/wow-forever/types/featureRequests/aboutYouState";

interface SuggestionAboutYouProps {
  aboutYou: AboutYouState;
  disabled: boolean;
}

const NOT_SAYING = "Rather not say";

/**
 * "About you (optional)" — collapsed by default, with a one-line summary of what will be sent and a
 * visible note that it IS sent, so nothing leaves the page unannounced.
 */
export default function SuggestionAboutYou({ aboutYou, disabled }: SuggestionAboutYouProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { context, summary, update, clear } = aboutYou;
  const hasAnswers = summary !== "";

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-h-[44px] items-center justify-between gap-2 px-3 py-2 text-left disabled:opacity-50"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">About you (optional)</span>
          <span className="block text-xs text-muted-foreground truncate">
            {hasAnswers ? `${summary} · Change` : "Helps me fit the idea to how you play · Add"}
          </span>
        </span>
        <ChevronDown className={clsx("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {hasAnswers ? (
        <p className="px-3 pb-2 text-xs text-muted-foreground">These are sent with your idea.</p>
      ) : null}
      {open ? (
        <div id={panelId} className="space-y-4 border-t p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ChoiceSelect
              id={`${panelId}-class`}
              label="Class"
              options={CONTEXT_CLASSES}
              labels={CONTEXT_CLASS_LABEL}
              value={context.class_id}
              onChange={(value) => update({ class_id: value })}
              emptyLabel={NOT_SAYING}
            />
            <ChoiceSelect
              id={`${panelId}-level`}
              label="Level"
              options={CONTEXT_LEVEL_BANDS}
              labels={CONTEXT_LEVEL_BAND_LABEL}
              value={context.level_band}
              onChange={(value) => update({ level_band: value })}
              emptyLabel={NOT_SAYING}
            />
            <ChoiceSelect
              id={`${panelId}-experience`}
              label="WoW experience"
              options={CONTEXT_EXPERIENCES}
              labels={CONTEXT_EXPERIENCE_LABEL}
              value={context.experience}
              onChange={(value) => update({ experience: value })}
              emptyLabel={NOT_SAYING}
            />
            <ChoiceSelect
              id={`${panelId}-faction`}
              label="Faction"
              options={CONTEXT_FACTIONS}
              labels={CONTEXT_FACTION_LABEL}
              value={context.faction}
              onChange={(value) => update({ faction: value })}
              emptyLabel={NOT_SAYING}
            />
          </div>
          <MultiChoiceChips
            legend="Professions"
            options={CONTEXT_PROFESSIONS}
            labels={CONTEXT_PROFESSION_LABEL}
            value={context.professions ?? []}
            onChange={(value) => update({ professions: value })}
          />
          <MultiChoiceChips
            legend="What you mostly do"
            options={CONTEXT_ACTIVITIES}
            labels={CONTEXT_ACTIVITY_LABEL}
            value={context.activities ?? []}
            onChange={(value) => update({ activities: value })}
          />
          {hasAnswers ? (
            <button
              type="button"
              onClick={clear}
              className="min-h-[44px] text-sm text-muted-foreground underline underline-offset-2"
            >
              Don't send any of this
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
