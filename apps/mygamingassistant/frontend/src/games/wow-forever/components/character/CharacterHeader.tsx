import { Link } from "react-router-dom";
import { Button } from "@platform/ui";
import { Check } from "lucide-react";
import { FACTION_LABELS } from "@/games/wow-forever/data/character/characterConfig";
import { GUILD_PAGE_PATH, GUILD_SLUG } from "@/games/wow-forever/data/guild/guildConfig";
import { LEADERBOARD_PARAMS } from "@/games/wow-forever/data/guild/leaderboardConfig";
import { BADGE } from "@/games/wow-forever/data/badgeStyles";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { playerSettingsFromCharacter, settingsMatchCharacter } from "@/games/wow-forever/lib/character/characterPlayerSettings";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";

/** Who the character is, when Blizzard last saw them, and a way to set MGA's pages to them. */
export default function CharacterHeader({ character }: { character: CharacterResponse }) {
  const [settings, updateSettings] = usePlayerSettings();
  const wanted = playerSettingsFromCharacter(character);
  const inUse = wanted !== null && settingsMatchCharacter(settings, wanted);
  const guild = character.guild ? `<${character.guild}>` : null;
  // topdeadcenter (the site's one guild page) is a link there; any other guild stays plain text.
  const guildLinked = guild !== null && character.guild_slug === GUILD_SLUG;
  const badges = [FACTION_LABELS[character.faction], character.ruleset, guildLinked ? null : guild].filter(
    (b): b is string => Boolean(b),
  );
  return (
    <section className="space-y-2" aria-label="Character">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">
          {character.name} {character.surname}
        </h2>
        {wanted ? (
          <Button variant="secondary" size="sm" onClick={() => updateSettings(wanted)} disabled={inUse} className="min-h-[36px]">
            {inUse ? (
              <>
                <Check className="mr-1 h-4 w-4" aria-hidden /> MGA&apos;s pages use this character
              </>
            ) : (
              "Use for MGA's pages"
            )}
          </Button>
        ) : null}
      </div>
      <p className="text-sm">
        Level {character.level} {character.race} {character.class_name}
        {character.equipped_item_level ? (
          <span className="text-muted-foreground"> · item level {character.equipped_item_level}</span>
        ) : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {badges.map((badge) => (
          <span key={badge} className={BADGE}>
            {badge}
          </span>
        ))}
        {guildLinked ? (
          <Link
            to={`${GUILD_PAGE_PATH}?${LEADERBOARD_PARAMS.me}=${encodeURIComponent(character.slug)}`}
            className="inline-flex min-h-[44px] items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Guild ${character.guild}: see its members`}
          >
            <span className={`${BADGE} hover:bg-muted/40 underline-offset-2 hover:underline`}>{guild}</span>
          </Link>
        ) : null}
        {character.last_login ? (
          <span className="text-xs text-muted-foreground">From their last log out, {relativeTime(character.last_login)}</span>
        ) : null}
      </div>
      {wanted ? (
        <p className="text-xs text-muted-foreground">
          &ldquo;Use for MGA&apos;s pages&rdquo; sets your faction, class and level on the map, gear, food and trainer pages.
        </p>
      ) : null}
    </section>
  );
}
