import { Fragment, type ReactNode } from "react";
import { RAID_SECTION_HEADING_CLASS, SEGMENT_KIND, TIME_STYLE } from "@/games/wow-forever/data/raidPage";
import { formatDiscordTime, unixIso } from "@/games/wow-forever/lib/raidTime";
import type { Segment } from "@/games/wow-forever/types/raid";

interface RaidDescriptionProps {
  segments: Segment[];
  now: number;
}

/** The leader's description: text as typed, mentions without their ids, Discord timestamps in the viewer's zone. */
export default function RaidDescription({ segments, now }: RaidDescriptionProps) {
  if (segments.length === 0) return null;
  return (
    <section aria-labelledby="raid-about" className="space-y-2 rounded-xl border bg-card p-4 sm:p-5">
      <h2 id="raid-about" className={RAID_SECTION_HEADING_CLASS}>
        About this raid
      </h2>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        {segments.map((segment, index) => renderSegment(segment, index, now))}
      </p>
    </section>
  );
}

function renderSegment(segment: Segment, key: number, now: number): ReactNode {
  switch (segment.kind) {
    case SEGMENT_KIND.MENTION:
      return (
        <span key={key} className="rounded bg-sky-500/15 px-1 font-medium text-sky-800 dark:text-sky-200">
          {segment.text}
        </span>
      );
    case SEGMENT_KIND.TIME:
      return (
        <time
          key={key}
          dateTime={unixIso(segment.unix)}
          title={formatDiscordTime(segment.unix, TIME_STYLE.LONG_DATE_TIME, now)}
          className="rounded bg-muted px-1"
        >
          {formatDiscordTime(segment.unix, segment.style, now)}
        </time>
      );
    default:
      return <Fragment key={key}>{segment.text}</Fragment>;
  }
}
