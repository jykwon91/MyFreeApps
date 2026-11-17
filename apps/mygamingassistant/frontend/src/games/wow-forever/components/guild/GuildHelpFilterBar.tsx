import clsx from "clsx";
import { GUILD_HELP_TEXT, HELP_MODE_LABELS, HELP_MODES, HELP_TYPE_LABELS, HELP_TYPES } from "@/games/wow-forever/data/guild/guildHelpConfig";
import { GUILD_CONTROL, GUILD_PROFESSION_CHIP, GUILD_PROFESSION_CHIP_ON } from "@/games/wow-forever/data/guild/guildStyles";
import { memberFullName } from "@/games/wow-forever/lib/guild/guildMembers";
import type { GuildHelpFilters } from "@/games/wow-forever/types/guild/guildHelpFilters";
import type { GuildHelpMember } from "@/games/wow-forever/types/guild/guildHelpMember";

interface GuildHelpFilterBarProps {
  members: readonly GuildHelpMember[];
  filters: GuildHelpFilters;
  onChange: (filters: GuildHelpFilters) => void;
}

/**
 * The Help each other tab's controls:
 * - Type chips: All / Enchants / Gear upgrades
 * - PvE / PvP chips: which weights score the gear
 * - Made by: whose recipes count (members with a profession)
 * - Help for: who the matches are for
 */
export default function GuildHelpFilterBar({ members, filters, onChange }: GuildHelpFilterBarProps) {
  const { type, mode, forSlug, bySlug } = filters;
  const crafters = members.filter((m) => m.professions.length > 0);
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
            onClick={() => onChange({ ...filters, type: t })}
            className={clsx(GUILD_PROFESSION_CHIP, type === t && GUILD_PROFESSION_CHIP_ON)}
          >
            {HELP_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <div role="group" aria-label={GUILD_HELP_TEXT.modeLabel} className="flex gap-2" data-testid="help-mode-chips">
        {HELP_MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => onChange({ ...filters, mode: m })}
            className={clsx(GUILD_PROFESSION_CHIP, mode === m && GUILD_PROFESSION_CHIP_ON)}
          >
            {HELP_MODE_LABELS[m]}
          </button>
        ))}
      </div>
      {members.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-xl">
          <div className="space-y-1">
            <label htmlFor="help-by-picker" className="block text-sm font-medium text-foreground">
              {GUILD_HELP_TEXT.madeByLabel}
            </label>
            <select
              id="help-by-picker"
              value={bySlug ?? ""}
              onChange={(e) => onChange({ ...filters, bySlug: e.target.value || null })}
              className={GUILD_CONTROL}
              data-testid="help-by-picker"
            >
              <option value="">{GUILD_HELP_TEXT.madeByAnyone}</option>
              {crafters.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {memberFullName(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="help-for-picker" className="block text-sm font-medium text-foreground">
              {GUILD_HELP_TEXT.forLabel}
            </label>
            <select
              id="help-for-picker"
              value={forSlug ?? ""}
              onChange={(e) => onChange({ ...filters, forSlug: e.target.value || null })}
              className={GUILD_CONTROL}
              data-testid="help-for-picker"
            >
              <option value="">{GUILD_HELP_TEXT.forEveryone}</option>
              {members.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {memberFullName(m)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
