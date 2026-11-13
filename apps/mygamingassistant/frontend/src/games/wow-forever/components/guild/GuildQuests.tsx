import { Scroll } from "lucide-react";
import { useId, useMemo } from "react";
import { Link } from "react-router-dom";
import GuildTitleMedallion from "@/games/wow-forever/components/guild/GuildTitleMedallion";
import { CHARACTER_PAGE_PATH } from "@/games/wow-forever/data/character/characterConfig";
import { QUESTS_COPY } from "@/games/wow-forever/data/guild/guildHallCopy";
import { HALL_HEADING, HALL_SECTION } from "@/games/wow-forever/data/guild/guildStyles";
import { myQuests } from "@/games/wow-forever/lib/guild/guildQuests";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildTitles } from "@/games/wow-forever/types/guild/guildTitles";

interface GuildQuestsProps {
  members: readonly GuildMember[];
  titles: GuildTitles;
  /** The viewer's character slug (`?me=`); "" for none. */
  me: string;
}

/** "Your quests": the viewer's three closest title steals; a one-line nudge without `?me=`; nothing for a character that isn't in this guild. */
export default function GuildQuests({ members, titles, me }: GuildQuestsProps) {
  const headingId = useId();
  const quests = useMemo(() => myQuests(members, titles, me), [members, titles, me]);
  if (!me) {
    return (
      <p className="rounded-xl border border-dashed bg-card p-3 text-sm text-muted-foreground">
        {QUESTS_COPY.nudge}{" "}
        <Link to={CHARACTER_PAGE_PATH} className="inline-flex min-h-[44px] items-center font-medium text-primary underline-offset-2 hover:underline">
          {QUESTS_COPY.nudgeLink}
        </Link>
      </p>
    );
  }
  if (!members.some((m) => m.slug === me)) return null;
  return (
    <section aria-labelledby={headingId} className={HALL_SECTION}>
      <div>
        <h2 id={headingId} className={HALL_HEADING}>
          <Scroll aria-hidden className="h-5 w-5 text-primary" />
          {QUESTS_COPY.heading}
        </h2>
        <p className="text-sm text-muted-foreground">{QUESTS_COPY.note}</p>
      </div>
      {quests.length === 0 ? (
        <p className="text-sm">{QUESTS_COPY.empty}</p>
      ) : (
        <ul className="space-y-2" aria-label={QUESTS_COPY.listLabel}>
          {quests.map((quest) => (
            <li key={quest.title.boardId} className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <GuildTitleMedallion icon={quest.title.icon} tier={quest.title.tier} size="inline" />
              <span className="text-sm">{quest.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
