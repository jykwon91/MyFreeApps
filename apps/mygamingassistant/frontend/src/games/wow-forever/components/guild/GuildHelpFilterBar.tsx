import clsx from "clsx";
import { GUILD_CONTROL, GUILD_PROFESSION_CHIP, GUILD_PROFESSION_CHIP_ON } from "@/games/wow-forever/data/guild/guildStyles";
import { memberFullName } from "@/games/wow-forever/lib/guild/guildMembers";
import { HELP_TYPE_LABELS, HELP_TYPES } from "@/games/wow-forever/lib/guild/guildHelpParams";
import type { GuildHelpMember } from "@/games/wow-forever/types/guild/guildHelpMember";
import type { GuildMatchType } from "@/games/wow-forever/types/guild/guildMatch";

interface GuildHelpFilterBarProps {
  members: readonly GuildHelpMember[];
  type: GuildMatchType | "all";
  forSlug: string | null;
  onType: (type: GuildMatchType | "all") => void;
  onFor: (slug: string | null) => void;
}

/**
 * Two controls for the Help each other tab:
 * - Type chips: All / Enchants / Gear upgrades
 * - Member picker: who the matches are for
 */
export default function GuildHelpFilterBar({ members, type, forSlug, onType, onFor }: GuildHelpFilterBarProps) {
  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label="Match type"
        className="-mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
        data-testid="help-type-chips"
      >
        {HELP_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => onType(t)}
            className={clsx(GUILD_PROFESSION_CHIP, type === t && GUILD_PROFESSION_CHIP_ON)}
          >
            {HELP_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      {members.length > 0 && (
        <div className="space-y-1">
          <label htmlFor="help-for-picker" className="text-sm font-medium text-foreground">
            Help for
          </label>
          <select
            id="help-for-picker"
            value={forSlug ?? ""}
            onChange={(e) => onFor(e.target.value || null)}
            className={`${GUILD_CONTROL} sm:max-w-xs`}
            data-testid="help-for-picker"
          >
            <option value="">Everyone</option>
            {members.map((m) => (
              <option key={m.slug} value={m.slug}>
                {memberFullName(m)}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
